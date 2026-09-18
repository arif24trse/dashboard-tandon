/* =========================================================================
   PERTAHANKAN KODE AUTENTIKASI & MQTT BROKER LAMA ANDA DI SINI
   Jangan ganti host, port, topic, username, atau password broker asli.
   ========================================================================= */

// CONTOH STUB DOKUMENTASI KONEKSI LAMA (GUNAKAN KODE PAHO KONEKSI KANAN ANDA):
/*
var client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), "clientId_" + Math.random());
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.connect({ onSuccess: onConnect, onFailure: onFailure, useSSL: true });
*/

// =========================================================================
// HELPER PERUBAHAN TAMPILAN DINAMIS (INTEGRASIKAN KEDALAM ONMESSAGEARRIVED)
// =========================================================================

/**
 * Panggil fungsi ini di dalam callback MQTT `onMessageArrived(message)`
 * ketika persentase air atau jarak air diperbarui.
 * 
 * @param {number} percentage - Persentase air (0 - 100)
 * @param {number} distance - Jarak sensor dalam cm
 */
function updateWaterUI(percentage, distance) {
    percentage = Math.max(0, Math.min(100, parseFloat(percentage) || 0));
    
    // 1. Update Teks Persentase & Jarak
    const percentElem = document.getElementById('water-percentage');
    const distElem = document.getElementById('water-distance');
    if (percentElem) percentElem.innerText = percentage.toFixed(0) + '%';
    if (distElem) distElem.innerText = (distance !== undefined ? distance : '---') + ' cm';

    // 2. Adjust Ketinggian Air Visual
    const fillElem = document.getElementById('water-fill');
    if (fillElem) {
        fillElem.style.height = percentage + '%';
        
        // 3. Dynamic Color Transition (Smooth Dynamic Gradient)
        fillElem.style.background = getWaterGradient(percentage);
    }

    // 4. Update Water Status Badge
    const statusElem = document.getElementById('water-status');
    if (statusElem) {
        let statusText = "NORMAL";
        let statusBg = "#e2e8f0";
        let statusColor = "#334155";

        if (percentage <= 15) {
            statusText = "KOSONG";
            statusBg = "#fee2e2";
            statusColor = "#991b1b";
        } else if (percentage <= 35) {
            statusText = "RENDAH";
            statusBg = "#ffedd5";
            statusColor = "#c2410c";
        } else if (percentage <= 75) {
            statusText = "NORMAL";
            statusBg = "#dcfce7";
            statusColor = "#15803d";
        } else {
            statusText = "PENUH";
            statusBg = "#e0f2fe";
            statusColor = "#0369a1";
        }

        statusElem.innerText = statusText;
        statusElem.style.backgroundColor = statusBg;
        statusElem.style.color = statusColor;
    }
}

/**
 * Menghitung perpaduan warna air berdasarkan persentase (0% - 100%)
 */
function getWaterGradient(pct) {
    // Definisi Warna R,G,B
    // 0%: Red (238, 93, 80)
    // 25%: Orange (255, 145, 0)
    // 50%: Yellow (255, 181, 71)
    // 75%: Green (1, 181, 116)
    // 100%: Blue (0, 136, 255)

    let r, g, b;
    if (pct <= 25) {
        let factor = pct / 25;
        r = Math.round(238 + (255 - 238) * factor);
        g = Math.round(93 + (145 - 93) * factor);
        b = Math.round(80 + (0 - 80) * factor);
    } else if (pct <= 50) {
        let factor = (pct - 25) / 25;
        r = Math.round(255 + (255 - 255) * factor);
        g = Math.round(145 + (181 - 145) * factor);
        b = Math.round(0 + (71 - 0) * factor);
    } else if (pct <= 75) {
        let factor = (pct - 50) / 25;
        r = Math.round(255 + (1 - 255) * factor);
        g = Math.round(181 + (181 - 181) * factor);
        b = Math.round(71 + (116 - 71) * factor);
    } else {
        let factor = (pct - 75) / 25;
        r = Math.round(1 + (0 - 1) * factor);
        g = Math.round(181 + (136 - 181) * factor);
        b = Math.round(116 + (255 - 116) * factor);
    }

    return `linear-gradient(180deg, rgba(${r},${g},${b},0.85) 0%, rgb(${r},${g},${b}) 100%)`;
}

/**
 * Helper untuk mengupdate status server MQTT di UI
 */
function updateServerStatus(isConnected) {
    const dotElem = document.getElementById('status-dot');
    const textElem = document.getElementById('status-text');
    
    if (isConnected) {
        if (dotElem) dotElem.classList.add('connected');
        if (textElem) {
            textElem.innerText = "Terhubungs";
            textElem.style.color = "#01b574";
        }
    } else {
        if (dotElem) dotElem.classList.remove('connected');
        if (textElem) {
            textElem.innerText = "Terputus";
            textElem.style.color = "#ee5d50";
        }
    }
}
