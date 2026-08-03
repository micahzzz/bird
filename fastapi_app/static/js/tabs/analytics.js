// /static/js/tabs/analytics.js

import * as state from '../state.js';
import * as api from '../api.js';

let currentAnalyticsView = 'acc';

async function renderAnalytics() {
    const days = document.getElementById('global-date-filter').value;
    const statsData = await api.fetchStats(days);

    if (currentAnalyticsView === 'acc') renderAccumulationChart(statsData);
    else if (currentAnalyticsView === 'weather') renderWeatherChart();
    else if (currentAnalyticsView === 'matrix') renderTimeMatrix(statsData);
    else if (currentAnalyticsView === 'health') renderHealth(statsData);
}

function renderAccumulationChart(data) {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    const accumulation = data.species_accumulation || [];
    
    state.setActiveChart(new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: accumulation.length}, (_,i) => i+1),
            datasets: [{
                label: 'Unique Species Detected',
                data: accumulation,
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.2)',
                fill: true,
                tension: 0.1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#cbd5e1' } }, x: { grid: { display: false }, ticks: { color: '#cbd5e1' }, title: { display: true, text: 'Detections', color: '#cbd5e1' } } } }
    }));
}

async function renderWeatherChart() {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    const {LATITUDE, LONGITUDE} = state.configData;
    const days = parseInt(document.getElementById('global-date-filter').value) || 30;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    const fmt = (d) => d.toISOString().split('T')[0];

    const tempUnit = state.isMetric ? 'celsius' : 'fahrenheit';
    const windUnit = state.isMetric ? 'kmh' : 'mph';
    const precipUnit = state.isMetric ? 'mm' : 'inch';
    
    const weatherData = await api.fetchWeatherData(LATITUDE, LONGITUDE, fmt(startDate), fmt(endDate), tempUnit, windUnit, precipUnit);
    const statsData = await api.fetchStats(days);

    const labels = weatherData.daily.time;
    const temps = weatherData.daily.temperature_2m_max;
    const precip = weatherData.daily.precipitation_sum;
    const wind = weatherData.daily.windspeed_10m_max;
    const detectionsByDay = labels.map(d => statsData.detections_by_date[d] || 0);

    state.setActiveChart(new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { type: 'line', label: 'Max Temp', yAxisID: 'y1', data: temps, borderColor: '#f87171', tension: 0.1, fill: false },
                { type: 'line', label: 'Max Wind', yAxisID: 'y1', data: wind, borderColor: '#60a5fa', tension: 0.1, fill: false, hidden: true },
                { label: 'Detections', yAxisID: 'y', data: detectionsByDay, backgroundColor: 'rgba(74, 222, 128, 0.6)' },
                { label: 'Precipitation', yAxisID: 'y', data: precip, backgroundColor: 'rgba(59, 130, 246, 0.6)' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { ticks: { color: '#cbd5e1' }, grid: { display: false } },
                y: { type: 'linear', display: true, position: 'left', title: { display: true, text: `Detections / Precip (${precipUnit})`, color: '#cbd5e1' }, ticks: { color: '#cbd5e1' } },
                y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: `Temp (${tempUnit}) / Wind (${windUnit})`, color: '#cbd5e1' }, grid: { drawOnChartArea: false }, ticks: { color: '#cbd5e1' } }
            }
        }
    }));
}

function renderTimeMatrix(data) {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    const matrix = data.time_matrix || [];
    const species = [...new Set(matrix.map(d => d.species))];
    
    state.setActiveChart(new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: matrix.map(d => ({
                label: d.species,
                data: [{x: d.hour, y: species.indexOf(d.species), r: d.count * 2}],
                backgroundColor: `hsla(${Math.random()*360}, 70%, 50%, 0.7)`
            }))
        },
        options: { 
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { title: {display: true, text: 'Hour of Day', color: '#cbd5e1'}, grid: { display: false }, ticks: {color: '#cbd5e1'} },
                y: { ticks: { color: '#cbd5e1', callback: (v) => species[v] ? (species[v].length > 15 ? species[v].substring(0,12)+'...' : species[v]) : '' } }
            }
        }
    }));
}

function renderHealth(data) {
    document.getElementById('analytics-health-container').innerHTML = `
        <div class="bird-card p-6">
            <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-2">Database Insights</h3>
            <div class="space-y-4">
                <div><span class="font-bold text-slate-300">Total Detections:</span> <span class="font-mono text-link">${(data.total_detections || 0).toLocaleString()}</span></div>
                <div><span class="font-bold text-slate-300">Total Species:</span> <span class="font-mono text-link">${(data.total_species || 0).toLocaleString()}</span></div>
                <div><span class="font-bold text-slate-300">Detections this Period:</span> <span class="font-mono text-link">${(data.period_detections || 0).toLocaleString()}</span></div>
                <div><span class="font-bold text-slate-300">Species this Period:</span> <span class="font-mono text-link">${(data.period_species || 0).toLocaleString()}</span></div>
            </div>
        </div>
        <div class="bird-card p-6">
            <h3 class="text-sm font-bold text-white uppercase tracking-wider mb-2">Acoustic Noise Health</h3>
            <canvas id="noise-chart"></canvas>
        </div>
    `;
    
    const noiseCtx = document.getElementById('noise-chart').getContext('2d');
    const noiseData = data.noise_data || {};
    new Chart(noiseCtx, {
        type: 'line',
        data: {
            labels: Object.keys(noiseData),
            datasets: [{ label: 'Avg. Noise Floor', data: Object.values(noiseData), borderColor: '#facc15', fill: false }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

export function switchAnalytics(view, btn) {
    currentAnalyticsView = view;
    document.querySelectorAll('#tab-analytics .toggle-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');

    document.getElementById('analytics-chart-container').style.display = (view === 'health') ? 'none' : 'block';
    document.getElementById('analytics-health-container').style.display = (view === 'health') ? 'grid' : 'none';
    document.getElementById('weather-unit-toggle').style.display = (view === 'weather') ? 'flex' : 'none';
    
    renderAnalytics();
}

export function setupAnalyticsTab() {
    window.switchAnalytics = switchAnalytics;
    document.getElementById('unit-metric').addEventListener('click', () => {
        state.setIsMetric(true);
        renderAnalytics();
    });
    document.getElementById('unit-imperial').addEventListener('click', () => {
        state.setIsMetric(false);
        renderAnalytics();
    });
    document.getElementById('global-date-filter').addEventListener('change', renderAnalytics);

    // Initial render
    renderAnalytics();
}
