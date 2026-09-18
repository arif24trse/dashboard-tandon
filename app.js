/* =========================================================================
   1. KONFIGURASI KONEKSI MQTT (SESUAI FIRMWARE ESP32)
   ========================================================================= */
// Broker WebSocket HiveMQ Cloud
const MQTT_HOST = "941be002ec5e47869861c1c75a6fcdc0.s1.eu.hivemq.cloud";
const MQTT_PORT = 8843; // Port WSS HiveMQ Cloud (Websocket Secure)
const MQTT_USER = "arif";
const MQTT_PASS = "smarthome123";

const CLIENT_ID = "WebDashboard_" + Math.random().toString(16).substr(2, 8);

// Subscriptions & Commands Topics (Sesuai ESP32)
const TOPIC_SUB_AIR_PERSEN   = "smarthome/air/persen";
const TOPIC_SUB_AIR_TINGGI   = "smarthome/air/tinggi";
const TOPIC_SUB_POMPA_STATUS = "smarthome/pompa/status";
const TOPIC_SUB_MODE_STATUS  = "smarthome/mode/status";
const TOPIC_SUB_BUZZER_STATUS= "smarthome/buzzer/status";
const TOPIC_SUB_ESP_STATUS   = "smarthome/status";

const TOPIC_CMD_POMPA  = "smarthome/pompa/control";
const TOPIC_CMD_MODE   = "smarthome/mode";
const TOPIC_CMD_BUZZER = "smarthome/buzzer";
const TOPIC_CMD_RESET  = "smarthome/reset";

// Inisialisasi Paho MQTT Client
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), CLIENT_ID);

client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// Memulai Koneksi MQTT
connectMQTT();

function connectMQTT() {
    console.log("Menghubungkan ke HiveMQ Cloud...");
    client.connect({
        onSuccess: onConnect,
        onFailure: onFailure,
        userName: MQTT_USER,
        password: MQTT_PASS,
        useSSL: true,
        keepAliveInterval: 60,
        cleanSession: true
    });
}

function onConnect() {
    console.log("Terhubung ke MQTT Broker HiveMQ Cloud!");
    updateServerStatus(true);

    // Subscribe ke semua topic status dari ESP32
    client.subscribe(TOPIC_SUB_AIR_PERSEN);
    client.subscribe(TOPIC_SUB_AIR_TINGGI);
    client.subscribe(TOPIC_SUB_POMPA_STATUS);
    client.subscribe(TOPIC_SUB_MODE_STATUS);
    client.subscribe(TOPIC_SUB_BUZZER_STATUS);
    client.subscribe(TOPIC_SUB_ESP_STATUS);
}

function onFailure(responseObject) {
    console.error("Gagal terhubung ke MQTT: " + responseObject.errorMessage);
    updateServerStatus(false);
    setTimeout(connectMQTT, 5000);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.warn("Koneksi MQTT Terputus: " + responseObject.errorMessage);
        updateServerStatus(false);
        setTimeout(connectMQTT, 3000);
    }
}

/* =========================================================================
   2. MENERIMA DATA TELEMETRI DARI ESP32
   ========================================================================= */
let currentPersen = 0;
let currentJarak = 0;

function onMessageArrived(message) {
    const topic = message.destinationName;
    const payload = message.payloadString.trim();

    console.log(`[MQTT IN] ${topic} -> ${payload}`);

    if (topic === TOPIC_SUB_AIR_PERSEN) {
        if (payload !== "INIT") {
            currentPersen = parseFloat(payload) || 0;
            updateWaterUI(currentPersen, currentJarak);
        }
    } 
    else if (topic === TOPIC_SUB_AIR_TINGGI) {
        if (payload !== "INIT") {
            currentJarak = parseFloat(payload) || 0;
            updateWaterUI(currentPersen, currentJarak);
        }
    } 
    else if (topic === TOPIC_SUB_POMPA_STATUS) {
        updatePillValue('pump-value', payload);
    } 
    else if (topic === TOPIC_SUB_MODE_STATUS) {
        updatePillValue('mode-value', payload);
    } 
    else if (topic === TOPIC_SUB_BUZZER_STATUS) {
        // ESP membalas "OFF" untuk MUTE, dan "ON" untuk UNMUTE
        const buzzerDisplay = (payload === "OFF") ? "MUTE" : "ON";
        updatePillValue('buzzer-value', buzzerDisplay);
    }
}

/* =========================================================================
   3. KONTROL TOMBOL WEB DASHBOARD (PUBLISH COMMAND KE ESP32)
   ========================================================================= */
function sendMQTTCommand(topic, payload) {
    if (client.isConnected()) {
        const message = new Paho.MQTT.Message(payload);
        message.destinationName = topic;
        message.retained = false;
        client.send(message);
        console.log(`[MQTT OUT] ${topic} -> ${payload}`);
    } else {
        alert("Gagal mengirim perintah: Koneksi MQTT sedang terputus!");
    }
}

function setSystemMode(mode) {
    updatePillValue('mode-value', mode);
    sendMQTTCommand(TOPIC_CMD_MODE, mode);
}

function controlPump(state) {
    updatePillValue('pump-value', state);
    sendMQTTCommand(TOPIC_CMD_POMPA, state);
}

function controlBuzzer(state) {
    // Menyesuaikan payload perintah buzzer sesuai kode ESP32 ("MUTE" / "UNMUTE")
    const payload = (state === "MUTE") ? "MUTE" : "ON";
    updatePillValue('buzzer-value', state);
    sendMQTTCommand(TOPIC_CMD_BUZZER, payload);
}

function rebootESP() {
    if (confirm("Apakah Anda yakin ingin melakukan Reboot Perangkat ESP32?")) {
        sendMQTTCommand(TOPIC_CMD_RESET, "RESET");
    }
}

function updatePillValue(elementId, value) {
    const elem = document.getElementById(elementId);
    if (elem) elem.innerText = value;
}

/* =========================================================================
   4. TAMPILAN DINAMIS TANDON AIR & TRANSIKSI WARNA
   ========================================================================= */
function updateWaterUI(percentage, distance) {
    percentage = Math.max(0, Math.min(100, parseFloat(percentage) || 0));

    // Update Angka Persentase dan Tinggi Air
    const percentElem = document.getElementById('water-percentage');
    const distElem = document.getElementById('water-distance');
    if (percentElem) percentElem.innerText = percentage.toFixed(0) + '%';
    if (distElem) distElem.innerText = (distance !== undefined ? distance : '---') + ' cm';

    // Update Animasi Tinggi & Warna Air Tandon
    const fillElem = document.getElementById('water-fill');
    if (fillElem) {
        fillElem.style.height = percentage + '%';
        fillElem.style.background = getWaterGradient(percentage);
    }

    // Update Badge Status Air
    const statusElem = document.getElementById('water-status');
    if (statusElem) {
        let statusText = "NORMAL";
        let statusBg = "#dcfce7";
        let statusColor = "#15803d";

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

function getWaterGradient(pct) {
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

function updateServerStatus(isConnected) {
    const dotElem = document.getElementById('status-dot');
    const textElem = document.getElementById('status-text');

    if (isConnected) {
        if (dotElem) dotElem.classList.add('connected');
        if (textElem) {
            textElem.innerText = "Terhubung";
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
