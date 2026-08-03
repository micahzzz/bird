// /static/js/tabs/tools.js

import * as api from '../api.js';
import { formatFileSize } from '../ui.js';

let currentSpeciesList = 'confirmed';
let currentPath = '';

async function loadConfig() {
    try {
        const data = await api.fetchConfig();
        for (const key in data) {
            const el = document.getElementById(`config-${key}`);
            if (el) {
                if (el.type === 'checkbox') {
                    el.checked = (data[key] === 'true');
                } else if (el.type === 'radio') {
                    document.querySelector(`input[name=${key}][value=${data[key]}]`).checked = true;
                } else {
                    el.value = data[key];
                }
            }
        }
    } catch(e) {
        alert("Failed to load configuration: " + e.message);
    }
}

async function saveConfig() {
    const statusEl = document.getElementById('config-save-status');
    const updates = {};
    document.querySelectorAll('[id^=config-]').forEach(el => {
        const key = el.id.replace('config-', '');
        if (el.type === 'checkbox') {
            updates[key] = el.checked;
        } else if (el.type === 'radio') {
            if (el.checked) updates[key] = el.value;
        } else {
            updates[key] = el.value;
        }
    });

    statusEl.innerText = "Saving...";
    statusEl.className = 'mt-2 text-sm text-yellow-400';
    try {
        await api.saveConfig(updates);
        statusEl.innerText = "Configuration saved successfully!";
        statusEl.className = 'mt-2 text-sm text-green-400';
    } catch (e) {
        statusEl.innerText = "Error saving configuration: " + e.message;
        statusEl.className = 'mt-2 text-sm text-red-400';
    }
}

async function testNotification() {
    const statusEl = document.getElementById('test-notification-status');
    statusEl.innerText = "Sending...";
    statusEl.className = "text-xs font-bold text-yellow-400";
    try {
        await api.testNotification(
            document.getElementById('config-APPRISE_SERVICES').value,
            document.getElementById('config-APPRISE_NOTIFICATION_TITLE').value,
            document.getElementById('config-APPRISE_NOTIFICATION_BODY').value
        );
        statusEl.innerText = "Sent!";
        statusEl.className = "text-xs font-bold text-green-400";
    } catch (e) {
        statusEl.innerText = "Failed!";
        statusEl.className = "text-xs font-bold text-red-400";
        alert("Failed to send test notification: " + e.message);
    }
}

async function loadServiceStatus() {
    const tbody = document.getElementById('services-table-body');
    try {
        const statuses = await api.fetchServiceStatus();
        tbody.innerHTML = '';
        statuses.forEach(s => {
            const statusClass = s.active === 'active' ? 'text-green-400' : 'text-red-400';
            const enabledClass = s.enabled === 'enabled' ? 'text-green-400' : 'text-red-400';
            tbody.innerHTML += `
                <tr>
                    <td class="p-4 text-white font-bold">${s.name}</td>
                    <td class="p-4"><span class="${statusClass}">${s.active}</span> / <span class="${enabledClass}">${s.enabled}</span></td>
                    <td class="p-4 text-right space-x-2">
                        <button onclick="handleServiceControl('${s.name}', 'start')" class="control-btn bg-green-600">Start</button>
                        <button onclick="handleServiceControl('${s.name}', 'stop')" class="control-btn bg-red-600">Stop</button>
                        <button onclick="handleServiceControl('${s.name}', 'restart')" class="control-btn bg-yellow-600">Restart</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-red-400">Failed to load service status.</td></tr>';
    }
}

async function handleServiceControl(service, action) {
    if (!confirm(`Are you sure you want to ${action} ${service}?`)) return;
    try {
        await api.controlService(service, action);
        alert(`Request to ${action} ${service} sent.`);
        setTimeout(loadServiceStatus, 2000);
    } catch (e) {
        alert("Error sending command: " + e.message);
    }
}

async function handleSystemControl(action) {
    if (!confirm(`Are you sure you want to ${action} the system? This action is irreversible.`)) return;
    try {
        const res = await api.systemControl(action);
        alert(`Success: ${res.message}`);
    } catch (e) {
        alert(`Error: Could not perform ${action}. ${e.message}`);
    }
}

async function loadSpeciesList(listName) {
    currentSpeciesList = listName;
    document.querySelectorAll('.species-list-btn').forEach(b => b.classList.remove('border-[var(--bn-highlight)]', 'text-[var(--bn-highlight)]'));
    document.getElementById(`btn-list-${listName}`).classList.add('border-[var(--bn-highlight)]', 'text-[var(--bn-highlight)]');
    const textarea = document.getElementById('species-list-textarea');
    textarea.value = 'Loading...';
    try {
        const data = await api.fetchSpeciesList(listName);
        textarea.value = data;
    } catch (e) {
        textarea.value = 'Error loading list: ' + e.message;
    }
}

async function saveSpeciesList() {
    const statusEl = document.getElementById('species-list-status');
    const content = document.getElementById('species-list-textarea').value;
    statusEl.innerText = 'Saving...';
    statusEl.className = 'mt-2 text-sm text-yellow-400';
    try {
        await api.saveSpeciesList(currentSpeciesList, content);
        statusEl.innerText = 'List saved successfully!';
        statusEl.className = 'mt-2 text-sm text-green-400';
    } catch (e) {
        statusEl.innerText = 'Error saving list: ' + e.message;
        statusEl.className = 'mt-2 text-sm text-red-400';
    }
}

async function loadFileManager(path = '') {
    currentPath = path;
    const tbody = document.getElementById('file-manager-body');
    document.getElementById('file-manager-breadcrumbs').innerText = `Current Path: /${path}`;
    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center">Loading...</td></tr>';
    try {
        const files = await api.fetchFiles(path);
        tbody.innerHTML = '';
        if (path !== '') {
            const parentPath = path.split('/').slice(0, -1).join('/');
            tbody.innerHTML += `
                <tr class="cursor-pointer hover:bg-[var(--bn-bg)]" onclick="loadFileManagerWrapper('${parentPath}')">
                    <td class="p-3 text-white font-bold" colspan="4">.. (Parent Directory)</td>
                </tr>
            `;
        }
        files.forEach(f => {
            tbody.innerHTML += `
                <tr class="cursor-pointer hover:bg-[var(--bn-bg)]">
                    <td class="p-3 text-white" onclick="handleFileClick('${f.name}', ${f.is_dir})">
                        ${f.is_dir ? '📁' : '📄'} ${f.name}
                    </td>
                    <td class="p-3 text-slate-300">${f.is_dir ? '--' : formatFileSize(f.size)}</td>
                    <td class="p-3 text-slate-300">${new Date(f.modified).toLocaleString()}</td>
                    <td class="p-3 text-right">
                        ${!f.is_dir ? `<a href="/api/files/download?path=${encodeURIComponent(currentPath + '/' + f.name)}" class="control-btn bg-blue-600" download>Download</a>` : ''}
                        <button onclick="deleteFileWrapper('${currentPath + '/' + f.name}')" class="control-btn bg-red-600">Delete</button>
                    </td>
                </tr>
            `;
        });
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Error: ${e.message}</td></tr>`;
    }
}

function handleFileClick(name, isDir) {
    if (isDir) {
        loadFileManager(currentPath ? `${currentPath}/${name}` : name);
    }
}

async function deleteFileWrapper(path) {
    if (!confirm(`Are you sure you want to delete ${path}? This cannot be undone.`)) return;
    try {
        await api.deleteFile(path);
        loadFileManager(currentPath);
    } catch (e) {
        alert('Error deleting file: ' + e.message);
    }
}

export function switchTools(view) {
    document.querySelectorAll('#tab-tools .toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`#tab-tools .toggle-btn[onclick="switchTools('${view}')"]`).classList.add('active');
    ['config', 'services', 'species', 'files'].forEach(v => {
        document.getElementById(`tools-${v}`).style.display = (v === view) ? (v === 'services' || v === 'config' ? 'grid' : 'block') : 'none';
    });
    if (view === 'services') loadServiceStatus();
    if (view === 'files') loadFileManager();
}

export function setupTools() {
    // Make functions globally available for inline onclicks
    window.switchTools = switchTools;
    window.loadSpeciesList = loadSpeciesList;
    window.handleServiceControl = handleServiceControl;
    window.handleSystemControl = handleSystemControl;
    window.loadFileManagerWrapper = loadFileManager;
    window.handleFileClick = handleFileClick;
    window.deleteFileWrapper = deleteFileWrapper;

    document.getElementById('btn-save-config').addEventListener('click', saveConfig);
    document.getElementById('btn-test-notification').addEventListener('click', testNotification);
    document.getElementById('btn-save-species-list').addEventListener('click', saveSpeciesList);

    // Initial loads
    loadConfig();
    loadSpeciesList('confirmed');
}
