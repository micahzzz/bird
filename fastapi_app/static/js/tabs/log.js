// /static/js/tabs/log.js

import * as api from '../api.js';

let logInterval;

async function pollLog() {
    try {
        const logData = await api.fetchLog();
        document.getElementById('log-output').textContent = logData;
    } catch(e) {
        document.getElementById('log-output').textContent = "Error fetching log: " + e.message;
    }
}

export function startLogPolling() {
    if (!logInterval) {
        pollLog();
        logInterval = setInterval(pollLog, 5000);
    }
}

export function stopLogPolling() {
    if (logInterval) {
        clearInterval(logInterval);
        logInterval = null;
    }
}
