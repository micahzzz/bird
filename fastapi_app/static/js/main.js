// main.js
import * as api from './api.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log("BirdNET-Pi UI Initializing...");
    init();
});

// Store for global state
const state = {
    currentTab: 'dashboard',
    currentAnalyticsTab: 'accumulation',
    logSource: null, // To hold the EventSource instance for the live log
    detections: [],
    config: {},
    systemInfo: {},
    gallery: {
        recent: [],
        today: [],
        best: [],
    },
    charts: {}, // To hold chart instances
};

// Add helper to handle log stream cleanup
function closeLogStream() {
    if (state.logSource) {
        state.logSource.close();
        state.logSource = null;
    }
}

// Global handler for HTML onclick events in the gallery tab
window.switchGallery = function(galleryType) {
    console.log("Switching gallery view to:", galleryType);
    // Add gallery rendering logic when built
};

function init() {
    setupEventListeners();
    loadInitialData();
    setInterval(updateSystemInfo, 5000); // Update telemetry every 5 seconds
    setInterval(updateDashboardStats, 60000); // Update dashboard stats every minute
}

function setupEventListeners() {
    // Main Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // Global Date Filter
    document.getElementById('global-date-filter').addEventListener('change', (e) => {
        console.log(`Global date filter changed to: ${e.target.value}`);
        // Add logic to refresh data based on the new date range
        refreshCurrentTabData();
    });

    // Database search button
    document.querySelector('#tab-database button[onclick="filterDatabase()"]').addEventListener('click', () => {
        filterDatabase();
    });

    // Database export button
    document.querySelector('#tab-database button[onclick="exportDatabaseCSV()"]').addEventListener('click', () => {
        exportDatabaseCSV();
    });

    // Analytics tabs
    document.querySelectorAll('.analytics-nav-item').forEach(item => {
        item.addEventListener('click', () => switchAnalyticsTab(item.dataset.chart));
    });
    
    // Add other event listeners as features are built out
    // e.g., modal buttons, gallery sort, etc.
}

function switchTab(tabId) {
    if (state.currentTab === 'log' && tabId !== 'log') {
        closeLogStream();
    }

    state.currentTab = tabId;
    console.log(`Switching to tab: ${tabId}`);

    // Update nav item active states
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabId);
    });

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = content.id === `tab-${tabId}` ? 'block' : 'none';
    });
    
    document.getElementById('current-tab-title').textContent = tabId;

    // Hide date filter on tabs that don't need it
    const dateFilterTabs = ['dashboard', 'analytics', 'database'];
    document.getElementById('global-date-filter').style.display = dateFilterTabs.includes(tabId) ? 'block' : 'none';

    // Load data for the new tab
    refreshCurrentTabData();
}

async function loadInitialData() {
    await updateSystemInfo();
    await updateDashboardData();
}

async function refreshCurrentTabData() {
    switch (state.currentTab) {
        case 'dashboard':
            await updateDashboardData();
            break;
        case 'database':
            await loadDatabaseTab();
            break;
        case 'analytics':
            await loadAnalyticsTab();
            break;
        case 'gallery':
            // await loadGalleryTab();
            break;
        case 'compiler':
            // await loadCompilerTab();
            break;
        case 'log':
            // await setupLogStream();
            break;
        case 'tools':
            // await loadToolsTab();
            break;
        default:
            console.log(`No data refresh logic for tab: ${state.currentTab}`);
    }
}

async function updateSystemInfo() {
    try {
        state.systemInfo = await api.getSystemInfo();
        updateTelemetryUI(state.systemInfo);
    } catch (error) {
        console.error("Failed to update system info:", error);
    }
}

async function updateDashboardData() {
    try {
        const days = document.getElementById('global-date-filter').value;
        const [stats, recentDetections, hourlyStats] = await Promise.all([
            api.getStats({ days }),
            api.getDetections({ limit: 20, offset: 0 }), // For the "Recent Detections" feed
            api.getHourlyStats()
        ]);

        state.detections = recentDetections.detections;

        updateStatsUI(stats);
        updateRecentDetectionsUI(state.detections);
        renderHourlyChart(hourlyStats);

    } catch (error) {
        console.error("Failed to update dashboard data:", error);
        // Optionally, display an error message in the UI
    }
}

function updateStatsUI(stats) {
    // Update dashboard cards
    document.getElementById('dash-total').textContent = stats.total_detections;
    document.getElementById('dash-today').textContent = stats.today_detections;
    document.getElementById('dash-hour').textContent = stats.hour_detections;
    document.getElementById('dash-species-total').textContent = stats.total_species;

    // Update sidebar stats
    document.getElementById('sb-total').textContent = stats.total_detections;
    document.getElementById('sb-today').textContent = stats.today_detections;
    document.getElementById('sb-hour').textContent = stats.hour_detections;
    document.getElementById('sb-species-today').textContent = stats.today_species;
    document.getElementById('sb-species-total').textContent = stats.total_species;
}

function updateRecentDetectionsUI(detections) {
    const feed = document.getElementById('dash-feed');
    feed.innerHTML = ''; // Clear existing entries

    if (detections.length === 0) {
        feed.innerHTML = '<p class="text-slate-400 text-sm">No recent detections.</p>';
        return;
    }

    detections.forEach(det => {
        const div = document.createElement('div');
        div.className = 'p-3 bg-[var(--bn-bg)] rounded-lg flex items-center justify-between cursor-pointer hover:bg-[var(--bn-card)]';
        div.onclick = () => showDetectionModal(det); 

        div.innerHTML = `
            <div>
                <p class="font-bold text-white">${det.Com_Name}</p>
                <p class="text-xs text-slate-400">${det.Date} at ${det.Time}</p>
            </div>
            <div class="text-right">
                <p class="font-mono text-xs text-[var(--bn-highlight)]">${(det.Confidence * 100).toFixed(1)}%</p>
            </div>
        `;
        feed.appendChild(div);
    });
}

function showDetectionModal(detection) {
    console.log("Showing modal for:", detection);
    // Implementation to follow
}

function renderHourlyChart(hourlyStats) {
    const ctx = document.getElementById('dash-hourly-chart').getContext('2d');
    
    const labels = Object.keys(hourlyStats).sort();
    const data = labels.map(label => hourlyStats[label]);

    if (state.charts.hourly) {
        state.charts.hourly.destroy();
    }

    state.charts.hourly = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Detections per Hour',
                data: data,
                backgroundColor: 'rgba(52, 211, 153, 0.5)',
                borderColor: 'rgba(52, 211, 153, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

async function updateDashboardStats() {
    await updateDashboardData();
}

function updateTelemetryUI(data) {
    if (!data) return;

    // Temperature
    const tempF = data.temp;
    document.getElementById('sys-temp').textContent = `${tempF.toFixed(1)}°F`;
    const tempPercent = Math.min(100, Math.max(0, ((tempF - 32) / 150) * 100)); // Simple scale for F
    document.getElementById('sys-temp-bar').style.width = `${tempPercent}%`;

    // Memory
    document.getElementById('sys-mem').textContent = `${data.memory}%`;
    document.getElementById('sys-mem-bar').style.width = `${data.memory}%`;

    // Disk
    document.getElementById('sys-disk').textContent = `${data.disk}%`;
    document.getElementById('sys-disk-bar').style.width = `${data.disk}%`;

    // Uptime
    document.getElementById('sys-uptime').textContent = data.uptime;
}

// Placeholder for tab-specific loading functions
async function loadDatabaseTab(offset = 0, limit = 50) {
    const filters = getDatabaseFilters();
    try {
        const data = await api.getDetections({ ...filters, offset, limit });
        renderDatabaseTable(data.detections, data.total_count);
    } catch (error) {
        console.error("Failed to load database tab:", error);
    }
}

function getDatabaseFilters() {
    const sp = document.getElementById('db-filter-species').value;
    const dStart = document.getElementById('db-filter-date-start').value;
    const dEnd = document.getElementById('db-filter-date-end').value;
    const tStart = document.getElementById('db-filter-time-start').value;
    const tEnd = document.getElementById('db-filter-time-end').value;
    const minConf = document.getElementById('db-filter-conf').value;

    return { sp, dStart, dEnd, tStart, tEnd, minConf };
}

function renderDatabaseTable(detections, total_count) {
    const tableBody = document.getElementById('db-table-body');
    const resultsCount = document.getElementById('db-results-count');

    tableBody.innerHTML = '';
    resultsCount.textContent = `${total_count} Results`;

    if (detections.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">No detections match the current filters.</td></tr>';
        return;
    }

    detections.forEach(det => {
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td class="p-3">${det.Date}</td>
            <td class="p-3">${det.Time}</td>
            <td class="p-3 font-semibold text-white">${det.Com_Name}</td>
            <td class="p-3 italic">${det.Sci_Name}</td>
            <td class="p-3 font-mono text-[var(--bn-highlight)]">${(det.Confidence * 100).toFixed(1)}%</td>
            <td class="p-3 text-right">
                <button class="text-white hover:text-[var(--bn-highlight)]" onclick="showDetectionModal(${JSON.stringify(det).replace(/"/g, '&quot;')})">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                </button>
            </td>
        `;
    });
}

function filterDatabase() {
    loadDatabaseTab();
}

async function exportDatabaseCSV() {
    const filters = getDatabaseFilters();
    try {
        const data = await api.getDetections({ ...filters, limit: 100000, offset: 0 }); // A high limit to get all data
        const detections = data.detections;

        if (detections.length === 0) {
            alert("No data to export.");
            return;
        }

        const headers = Object.keys(detections[0]);
        const csvRows = [headers.join(',')];

        for (const row of detections) {
            const values = headers.map(header => {
                const escaped = ('' + row[header]).replace(/"/g, '\\"');
                return `"${escaped}"`;
            });
            csvRows.push(values.join(','));
        }

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', 'detections.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

    } catch (error) {
        console.error("Failed to export CSV:", error);
    }
}

async function loadAnalyticsTab() {
    switchAnalyticsTab(state.currentAnalyticsTab);
}

function switchAnalyticsTab(chartId) {
    state.currentAnalyticsTab = chartId;
    console.log(`Switching to analytics chart: ${chartId}`);

    // Update nav item active states
    document.querySelectorAll('.analytics-nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chart === chartId);
    });

    // Show/hide tab content
    document.querySelectorAll('.analytics-chart-content').forEach(content => {
        content.style.display = content.id === `chart-${chartId}` ? 'block' : 'none';
    });

    loadChartData();
}

async function loadChartData() {
    const days = document.getElementById('global-date-filter').value;
    const stats = await api.getStats({ days });

    switch (state.currentAnalyticsTab) {
        case 'accumulation':
            renderAccumulationChart(stats.species_by_date);
            break;
        case 'weather':
            // renderWeatherChart(stats);
            break;
        case 'time':
            // renderTimeMatrix(stats);
            break;
        case 'system':
            // renderSystemHealthChart(stats);
            break;
    }
}

function renderAccumulationChart(speciesByDate) {
    const canvas = document.getElementById('analytics-accumulation-chart');
    if (!canvas) return; // Guard against missing DOM element

    const ctx = canvas.getContext('2d');

    const dates = Object.keys(speciesByDate).sort();
    let cumulativeSpecies = new Set();
    const cumulativeCounts = [];

    for (const date of dates) {
        speciesByDate[date].forEach(species => cumulativeSpecies.add(species));
        cumulativeCounts.push(cumulativeSpecies.size);
    }

    if (state.charts.accumulation) {
        state.charts.accumulation.destroy();
    }

    state.charts.accumulation = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Cumulative Unique Species',
                data: cumulativeCounts,
                borderColor: 'rgba(52, 211, 153, 1)',
                backgroundColor: 'rgba(52, 211, 153, 0.2)',
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Unique Species Count', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    title: { display: true, text: 'Date', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}
// async function loadGalleryTab() { console.log("Loading Gallery Tab..."); }
// async function loadCompilerTab() { console.log("Loading Compiler Tab..."); }
// async function setupLogStream() { console.log("Setting up Log Stream..."); }
// async function loadToolsTab() { console.log("Loading Tools Tab..."); }
