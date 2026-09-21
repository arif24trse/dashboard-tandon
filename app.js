/* =========================================================================
   1. KONFIGURASI KONEKSI MQTT (HIVEMQ CLOUD WEBSOCKET)
   ========================================================================= */
const MQTT_HOST = "941be002ec5e47869861c1c75a6fcdc0.s1.eu.hivemq.cloud";
const MQTT_PORT = 8884; 
const MQTT_PATH = "/mqtt";
const MQTT_USER = "arif";
const MQTT_PASS = "smarthome123";

const CLIENT_ID = "WebDashboard_" + Math.random().toString(16).substr(2, 8);

// Topic Subscriptions & Commands Sesuai Firmware ESP32
const TOPIC_SUB_AIR_PERSEN   = "smarthome/air/persen";
const TOPIC_SUB_AIR_TINGGI   = "smarthome/air/tinggi";
const TOPIC_SUB_POMPA_STATUS = "smarthome/pompa/status";
const TOPIC_SUB_MODE_STATUS  = "smarthome/mode/status";
const TOPIC_SUB_BUZZER_STATUS= "smarthome/buzzer/status";
const TOPIC_SUB_ESP_STATUS   = "smarthome/status";

// Topic Khusus Timestamp Retained Anti-Reset
const TOPIC_TIMESTAMP_ON    = "smarthome/pompa/time_on";
const TOPIC_TIMESTAMP_OFF   = "smarthome/pompa/time_off";

const TOPIC_CMD_POMPA  = "smarthome/pompa/control";
const TOPIC_CMD_MODE   = "smarthome/mode";
const TOPIC_CMD_BUZZER = "smarthome/buzzer";
const TOPIC_CMD_RESET  = "smarthome/reset";

var client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_PATH, CLIENT_ID);

client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

connectMQTT();

function connectMQTT() {
    console.log("Menghubungkan ke HiveMQ Cloud via WebSocket...");
    var options = {
        timeout: 10,
        useSSL: true,
        userName: MQTT_USER,
        password: MQTT_PASS,
        onSuccess: onConnect,
        onFailure: onFailure,
        keepAliveInterval: 30
    };
    client.connect(options);
}

function onConnect() {
    console.log("Terhubung ke MQTT Broker!");
    updateServerStatus(true);

    client.subscribe(TOPIC_SUB_AIR_PERSEN);
    client.subscribe(TOPIC_SUB_AIR_TINGGI);
    client.subscribe(TOPIC_SUB_POMPA_STATUS);
    client.subscribe(TOPIC_SUB_MODE_STATUS);
    client.subscribe(TOPIC_SUB_BUZZER_STATUS);
    client.subscribe(TOPIC_SUB_ESP_STATUS);
    
    // Subscribe topic timestamp terpusat (Retained)
    client.subscribe(TOPIC_TIMESTAMP_ON);
    client.subscribe(TOPIC_TIMESTAMP_OFF);
}

function onFailure(responseObject) {
    console.error("Gagal terhubung: " + responseObject.errorMessage);
    updateServerStatus(false);
    setTimeout(connectMQTT, 5000);
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.warn("Koneksi Terputus: " + responseObject.errorMessage);
        updateServerStatus(false);
        setTimeout(connectMQTT, 3000);
    }
}

/* =========================================================================
   2. VARIABEL & TIMER REALTIME PERSISTEN (ANTI-RESET)
   ========================================================================= */
let currentPersen = "INIT";
let currentJarak = "INIT";
let isPumpOn = false;
let pumpStartTimestamp = parseInt(localStorage.getItem('pumpStartTimestamp')) || null;
let lastPumpOffTime = parseInt(localStorage.getItem('lastPumpOffTime')) || null;

setInterval(updatePumpTimerUI, 1000);

function onMessageArrived(message) {
    const topic = message.destinationName;
    const payload = message.payloadString.trim();

    if (topic === TOPIC_SUB_AIR_PERSEN) {
        currentPersen = (payload === "INIT") ? "INIT" : parseFloat(payload);
        updateWaterUI(currentPersen, currentJarak);
    } 
    else if (topic === TOPIC_SUB_AIR_TINGGI) {
        currentJarak = (payload === "INIT") ? "INIT" : parseFloat(payload);
        updateWaterUI(currentPersen, currentJarak);
    } 
    else if (topic === TOPIC_SUB_POMPA_STATUS) {
        updatePillValue('pump-value', payload);
        
        let statusIsOn = (payload.toUpperCase() === "ON");
        
        if (statusIsOn && !isPumpOn) {
            isPumpOn = true;
            if (!pumpStartTimestamp) {
                pumpStartTimestamp = Date.now();
                saveTimestamp(TOPIC_TIMESTAMP_ON, pumpStartTimestamp);
            }
        } else if (!statusIsOn && isPumpOn) {
            isPumpOn = false;
            lastPumpOffTime = Date.now();
            pumpStartTimestamp = null;
            saveTimestamp(TOPIC_TIMESTAMP_OFF, lastPumpOffTime);
            sendMQTTCommand(TOPIC_TIMESTAMP_ON, "", true);
            localStorage.removeItem('pumpStartTimestamp');
        } else {
            isPumpOn = statusIsOn;
        }
        
        toggleWaterfallAnimation(statusIsOn);
        updatePumpTimerUI();
    } 
    else if (topic === TOPIC_TIMESTAMP_ON) {
        if (payload && payload !== "") {
            pumpStartTimestamp = parseInt(payload);
            localStorage.setItem('pumpStartTimestamp', pumpStartTimestamp);
            isPumpOn = true;
            toggleWaterfallAnimation(true);
        }
    }
    else if (topic === TOPIC_TIMESTAMP_OFF) {
        if (payload && payload !== "") {
            lastPumpOffTime = parseInt(payload);
            localStorage.setItem('lastPumpOffTime', lastPumpOffTime);
        }
    }
    else if (topic === TOPIC_SUB_MODE_STATUS) {
        updatePillValue('mode-value', payload);
    } 
    else if (topic === TOPIC_SUB_BUZZER_STATUS) {
        const buzzerDisplay = (payload === "OFF") ? "MUTE" : "ON";
        updatePillValue('buzzer-value', buzzerDisplay);
    }
}

/* =========================================================================
   3. ANIMASI AIR MANCUR DINAMIS (MELEBUR KE PERMUKAAN AIR)
   ========================================================================= */
function toggleWaterfallAnimation(active) {
    const streamElem = document.getElementById('waterfall-stream');
    if (!streamElem) return;

    if (active) {
        streamElem.classList.add('active');
        adjustWaterfallHeight();
    } else {
        streamElem.classList.remove('active');
    }
}

function adjustWaterfallHeight() {
    const streamElem = document.getElementById('waterfall-stream');
    if (!streamElem) return;

    // Hitung persentase air saat ini
    let pct = (currentPersen === "INIT") ? 0 : Math.max(0, Math.min(100, parseFloat(currentPersen) || 0));
    
    // Ketinggian air terjun disesuaikan sehingga menyentuh tepat di atas air
    let targetStreamHeight = Math.max(0, 100 - pct);
    streamElem.style.height = targetStreamHeight + '%';

    // Tambahkan elemen percikan (splash) jika belum ada
    if (!document.getElementById('waterfall-splash')) {
        const splash = document.createElement('div');
        splash.id = 'waterfall-splash';
        splash.className = 'waterfall-splash';
        streamElem.appendChild(splash);
    }
}

/* =========================================================================
   4. SIMPAN TIMESTAMP TERPUSAT (MQTT + LOCALSTORAGE)
   ========================================================================= */
function saveTimestamp(topic, timestamp) {
    localStorage.setItem(topic === TOPIC_TIMESTAMP_ON ? 'pumpStartTimestamp' : 'lastPumpOffTime', timestamp);
    sendMQTTCommand(topic, timestamp.toString(), true);
}

function sendMQTTCommand(topic, payload, retained = false) {
    if (client.isConnected()) {
        var message = new Paho.MQTT.Message(payload);
        message.destinationName = topic;
        message.retained = retained;
        client.send(message);
    }
}

/* =========================================================================
   5. PERHITUNGAN TIMING STOPWATCH
   ========================================================================= */
function updatePumpTimerUI() {
    const durationElem = document.getElementById('pump-on-duration');
    const lastOnElem = document.getElementById('pump-last-on');

    const now = Date.now();

    if (isPumpOn && pumpStartTimestamp) {
        let diffSec = Math.floor((now - pumpStartTimestamp) / 1000);
        if (diffSec < 0) diffSec = 0;
        
        let hrs = Math.floor(diffSec / 3600);
        let mins = Math.floor((diffSec % 3600) / 60);
        let secs = diffSec % 60;

        if (durationElem) {
            durationElem.innerText = `${padZero(hrs)}:${padZero(mins)}:${padZero(secs)}`;
        }
    } else {
        if (durationElem) durationElem.innerText = "00:00:00";
    }

    if (isPumpOn) {
        if (lastOnElem) lastOnElem.innerText = "Sedang Berjalan";
    } else if (lastPumpOffTime) {
        let diffSec = Math.floor((now - lastPumpOffTime) / 1000);
        if (diffSec < 0) diffSec = 0;

        let mins = Math.floor(diffSec / 60);
        let hrs = Math.floor(mins / 60);

        let timeAgoStr = "";
        if (diffSec < 60) {
            timeAgoStr = `${diffSec} detik lalu`;
        } else if (mins < 60) {
            timeAgoStr = `${mins} menit lalu`;
        } else {
            timeAgoStr = `${hrs} jam ${mins % 60} menit lalu`;
        }

        if (lastOnElem) lastOnElem.innerText = timeAgoStr;
    } else {
        if (lastOnElem) lastOnElem.innerText = "Belum pernah";
    }
}

function padZero(num) {
    return num < 10 ? '0' + num : num;
}

/* =========================================================================
   6. KONTROL TOMBOL WEB
   ========================================================================= */
function setSystemMode(mode) {
    updatePillValue('mode-value', mode);
    sendMQTTCommand(TOPIC_CMD_MODE, mode);
}

function controlPump(state) {
    updatePillValue('pump-value', state);
    if (state === "ON" && !isPumpOn) {
        isPumpOn = true;
        pumpStartTimestamp = Date.now();
        saveTimestamp(TOPIC_TIMESTAMP_ON, pumpStartTimestamp);
        toggleWaterfallAnimation(true);
    } else if (state === "OFF" && isPumpOn) {
        isPumpOn = false;
        lastPumpOffTime = Date.now();
        saveTimestamp(TOPIC_TIMESTAMP_OFF, lastPumpOffTime);
        pumpStartTimestamp = null;
        sendMQTTCommand(TOPIC_TIMESTAMP_ON, "", true);
        localStorage.removeItem('pumpStartTimestamp');
        toggleWaterfallAnimation(false);
    }
    updatePumpTimerUI();
    sendMQTTCommand(TOPIC_CMD_POMPA, state);
}

function controlBuzzer(state) {
    const payload = (state === "MUTE") ? "MUTE" : "ON";
    updatePillValue('buzzer-value', state);
    sendMQTTCommand(TOPIC_CMD_BUZZER, payload);
}

function rebootESP() {
    if (confirm("Apakah Anda yakin ingin merestart perangkat ESP32?")) {
        sendMQTTCommand(TOPIC_CMD_RESET, "RESET");
    }
}

function updatePillValue(elementId, value) {
    const elem = document.getElementById(elementId);
    if (elem) elem.innerText = value;
}

/* =========================================================================
   7. TAMPILAN VISUAL AIR TANDON & ADJUSTMENT KETINGGIAN AIR TERJUN
   ========================================================================= */
function updateWaterUI(percentage, distance) {
    const percentElem = document.getElementById('water-percentage');
    const distElem = document.getElementById('water-distance');
    const statusElem = document.getElementById('water-status');
    const fillElem = document.getElementById('water-fill');

    if (percentage === "INIT" || distance === "INIT") {
        if (percentElem) percentElem.innerText = "INIT...";
        if (distElem) distElem.innerText = "INIT...";
        if (fillElem) {
            fillElem.style.height = '0%';
            fillElem.style.background = 'linear-gradient(180deg, #94a3b8 0%, #64748b 100%)';
        }
        if (statusElem) {
            statusElem.innerText = "INIT";
            statusElem.style.backgroundColor = "#e2e8f0";
            statusElem.style.color = "#475569";
        }
        return;
    }

    let pctNum = Math.max(0, Math.min(100, parseFloat(percentage) || 0));

    if (percentElem) percentElem.innerText = pctNum.toFixed(0) + '%';
    if (distElem) distElem.innerText = (distance !== undefined ? distance : '---') + ' cm';

    if (fillElem) {
        fillElem.style.height = pctNum + '%';
        fillElem.style.background = getWaterGradient(pctNum);
    }

    // Sesuaikan posisi jatuhnya kucuran air secara otomatis
    if (isPumpOn) {
        adjustWaterfallHeight();
    }

    if (statusElem) {
        let statusText = "NORMAL";
        let statusBg = "#dcfce7";
        let statusColor = "#15803d";

        if (pctNum <= 15) {
            statusText = "KOSONG";
            statusBg = "#fee2e2";
            statusColor = "#991b1b";
        } else if (pctNum <= 35) {
            statusText = "RENDAH";
            statusBg = "#ffedd5";
            statusColor = "#c2410c";
        } else if (pctNum <= 75) {
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
