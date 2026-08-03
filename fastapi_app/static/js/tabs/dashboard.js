// /static/js/tabs/dashboard.js

import * as state from '../state.js';
import * as api from '../api.js';
import { escapeAttr, searchAndPlay } from '../ui.js';

let dashChart = null;

export function renderDashboard(data) {
    const hourCounts = Array(24).fill(0);
    data.forEach(d => {
        if (d.Time) {
            const hr = parseInt(d.Time.split(':')[0], 10);
            if (!isNaN(hr)) hourCounts[hr]++;
        }
    });

    const ctx = document.getElementById('dash-hourly-chart').getContext('2d');
    if (dashChart) dashChart.destroy();
    dashChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: 24}, (_, i) => i),
            datasets: [{ 
                label: 'Detections', 
                data: hourCounts, 
                backgroundColor: '#4ade80', 
                borderRadius: 2,
                maxBarThickness: 36,
                categoryPercentage: 0.6,
                barPercentage: 0.8
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: { 
                y: { ticks: { color: '#cbd5e1' } }, 
                x: { grid: { display: false }, ticks: { callback: v => `${v}:00`, color: '#cbd5e1' } } 
            }
        }
    });

    const feed = document.getElementById('dash-feed');
    feed.innerHTML = '';
    state.dbData.slice(0, 30).forEach(d => {
        const pct = (parseFloat(d.Confidence)*100).toFixed(0);
        let insightBadge = '';
        if (d.insight && d.insight.status !== 'Normal') {
            const badgeClass = d.insight.status === 'New' ? 'insight-new' : 'insight-rare';
            insightBadge = `<span class="insight-badge ${badgeClass}" title="${d.insight.detail}">${d.insight.status}</span>`;
        }

        feed.innerHTML += `
            <div onclick="searchAndPlayWrapper('${escapeAttr(d.Com_Name)}', '${escapeAttr(d.Sci_Name)}', '${d.Date}', '${d.Time}', '${pct}')" class="flex justify-between items-center bg-[var(--bn-panel)] p-3 rounded-lg border border-[var(--bn-border)] cursor-pointer hover:bg-[var(--bn-bg)] transition-colors group">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-full bg-[var(--bn-card)] text-[var(--bn-highlight)] flex items-center justify-center border border-[var(--bn-border)] group-hover:bg-[var(--bn-highlight)] group-hover:text-[#122617] transition-colors shrink-0">
                        <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                    </div>
                    <div class="truncate">
                        <h4 class="text-white text-sm font-bold truncate">${d.Com_Name}${insightBadge}</h4>
                        <span class="text-xs text-slate-300">${d.Date} ${d.Time}</span>
                    </div>
                </div>
                <span class="text-xs font-mono font-bold ${pct < 70 ? 'text-yellow-400' : 'text-[var(--bn-highlight)]'}">${pct}%</span>
            </div>
        `;
    });
    // Make searchAndPlay available globally for the inline onclick
    window.searchAndPlayWrapper = searchAndPlay;
}

export async function updateDashboardStats(days = 'all') {
    try {
        const stats = await api.fetchStats(days);
        document.getElementById('dash-total').innerText = (stats.total_detections || 0).toLocaleString();
        document.getElementById('dash-species-total').innerText = (stats.total_species || 0).toLocaleString();
        document.getElementById('dash-today').innerText = (stats.today_detections || 0).toLocaleString();
        document.getElementById('dash-hour').innerText = (stats.hour_detections || 0).toLocaleString();
        // Sidebar stats
        document.getElementById('sb-total').innerText = (stats.total_detections || 0).toLocaleString();
        document.getElementById('sb-species-total').innerText = (stats.total_species || 0).toLocaleString();
        document.getElementById('sb-today').innerText = (stats.today_detections || 0).toLocaleString();
        document.getElementById('sb-hour').innerText = (stats.hour_detections || 0).toLocaleString();
        document.getElementById('sb-species-today').innerText = (stats.today_species || 0).toLocaleString();
    } catch(e) {
        console.error("Failed to update live stats", e);
    }
}

async function updateSystemStats() {
    try {
        const data = await api.fetchSystemStats();
        const tempC = data.temp;
        document.getElementById('sys-temp').innerText = `${tempC.toFixed(1)}┬░C`;
        
        const tempBar = document.getElementById('sys-temp-bar');
        if (tempBar) {
            const tempPct = Math.max(0, Math.min(100, (tempC / 85) * 100));
            tempBar.style.width = `${tempPct}%`;
        }
        
        document.getElementById('sys-mem').innerText = `${data.memory}%`;
        document.getElementById('sys-mem-bar').style.width = `${data.memory}%`;
        
        document.getElementById('sys-disk').innerText = `${data.disk}%`;
        document.getElementById('sys-disk-bar').style.width = `${data.disk}%`;
        
        document.getElementById('sys-uptime').innerText = `System Uptime: ${data.uptime}`;
    } catch(e) {
        // silent fail for telemetry
    }
}

export function initDashboard() {
    updateSystemStats();
    setInterval(updateSystemStats, 10000);
    setInterval(() => {
        const currentFilter = document.getElementById('global-date-filter').value;
        updateDashboardStats(currentFilter);
    }, 30000);
}
