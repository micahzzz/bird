const API_BASE = 'http://' + (window.location.hostname || 'localhost') + ':9999';
let dbData = [];
let configData = {};
let activeChart = null;
let isMetric = false; 
let galleryCacheRecent = [];
let galleryCacheBest = [];
let currentBestSort = 'name';
window.currentDbExport = [];

let modalChart = null;

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

let audioCtx;
let trackNode;
let gainNode;
let highpassNode;
let lowpassNode;
let isAudioSetup = false;
let animationFrameId;

Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#cbd5e1';
Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.1)';
Chart.defaults.scale.ticks.color = '#cbd5e1';

document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', async (e) => {
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        
        const target = e.currentTarget;
        target.classList.add('active');
        const tabId = target.getAttribute('data-tab');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        document.getElementById('current-tab-title').innerText = target.innerText.trim();
        
        const filter = document.getElementById('global-date-filter');
        if (['dashboard', 'analytics'].includes(tabId)) filter.classList.remove('hidden');
        else filter.classList.add('hidden');

        if (tabId === 'analytics') switchAnalytics('acc', document.querySelector('#tab-analytics .toggle-btn'));
        
        if (tabId === 'gallery' && galleryCacheRecent.length === 0) {
            await fetchGallery();
        } else if (tabId === 'gallery') {
            if (!document.querySelector('#tab-gallery .toggle-btn.active')) {
                switchGallery('recent', document.querySelector("#tab-gallery .toggle-btn[onclick*='recent']"));
            }
        }
        if (tabId === 'tools') populateConfigForm();
    });
});

function switchTools(view) {
    document.querySelectorAll('#tab-tools > div > .toggle-btn').forEach(b => b.classList.remove('active'));
    
    const activeBtn = document.querySelector(`#tab-tools .toggle-btn[onclick*="${view}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    ['config', 'services', 'species', 'files'].forEach(v => {
        const el = document.getElementById(`tools-${v}`);
        if (el) el.classList.toggle('hidden', v !== view);
    });
    
    if (view === 'services') loadServiceStatus();
    if (view === 'files') loadFileManager();
}

function getTodayStr() { 
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; 
}

async function init() {
    const loader = document.getElementById('loading-indicator');
    loader.classList.remove('hidden');
    try {
        const res = await fetch(API_BASE + '/api/detections');
        const payload = await res.json();
        dbData = payload.detections || [];
        window.currentDbExport = dbData;
        
        const confRes = await fetch(API_BASE + '/api/config');
        configData = await confRes.json();
        
        applyGlobalFilter(); 
        updateSystemStats();
        updateCompilerSuggestions();
        populateDatabaseFilter();
        filterDatabase();

        setInterval(() => {
            const currentFilter = document.getElementById('global-date-filter').value;
            updateLiveStats(currentFilter);
        }, 30000); 
        setInterval(updateSystemStats, 10000);
        setInterval(pollLog, 3000);

    } catch (e) { 
        document.getElementById('dash-feed').innerHTML = `<p class="text-red-400 font-bold p-4">Failed to load data. Is backend running?</p>`;
        console.error(e);
    } finally {
        loader.classList.add('hidden');
    }
}

async function updateLiveStats(days = 'all') {
    try {
        const res = await fetch(API_BASE + `/api/detections/stats?days=${days}`);
        const stats = await res.json();

        document.getElementById('dash-total').innerText = (stats.total_detections || 0).toLocaleString();
        document.getElementById('dash-species-total').innerText = (stats.total_species || 0).toLocaleString();
        
        document.getElementById('dash-today').innerText = (stats.today_detections || 0).toLocaleString();
        document.getElementById('dash-hour').innerText = (stats.hour_detections || 0).toLocaleString();

        document.getElementById('sb-total').innerText = (stats.total_detections || 0).toLocaleString();
        document.getElementById('sb-species-total').innerText = (stats.total_species || 0).toLocaleString();

        document.getElementById('sb-today').innerText = (stats.today_detections || 0).toLocaleString();
        document.getElementById('sb-hour').innerText = (stats.hour_detections || 0).toLocaleString();
        document.getElementById('sb-species-today').innerText = (stats.today_species || 0).toLocaleString();
        
    } catch(e) {
        console.error("Failed to update live stats", e);
    }
}

document.getElementById('global-date-filter').addEventListener('change', applyGlobalFilter);

function filterDataByDays(sourceData, daysStr) {
    if (daysStr === 'all' || sourceData.length === 0) return [...sourceData];
    if (daysStr === 'today') return sourceData.filter(d => d.Date === getTodayStr());
    
    if (daysStr === 'custom') {
        const start = document.getElementById('comp-date-start').value;
        const end = document.getElementById('comp-date-end').value;
        if(!start || !end) return [...sourceData];
        return sourceData.filter(d => d.Date >= start && d.Date <= end);
    }

    const latestDate = new Date(sourceData[0].Date + 'T00:00:00');
    const cutoff = new Date(latestDate);
    cutoff.setDate(cutoff.getDate() - parseInt(daysStr));
    return sourceData.filter(d => new Date(d.Date + 'T00:00:00') >= cutoff);
}

function applyGlobalFilter() {
    if (dbData.length === 0) return;
    const days = document.getElementById('global-date-filter').value;
    
    updateLiveStats(days);
    const filtered = filterDataByDays(dbData, days);
    renderDashboard(filtered);

    if(document.getElementById('tab-analytics').classList.contains('active')) {
        const activeBtn = document.querySelector(`#tab-analytics .toggle-btn.active`);
        switchAnalytics(currentAnalyticsMode, activeBtn);
    }
}

let dashChart = null;
function renderDashboard(data) {
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
    dbData.slice(0, 30).forEach(d => {
        const pct = (parseFloat(d.Confidence)*100).toFixed(0);
        let insightBadge = '';
        if (d.insight && d.insight.status !== 'Normal') {
            const badgeClass = d.insight.status === 'New' ? 'insight-new' : 'insight-rare';
            insightBadge = `<span class="insight-badge ${badgeClass}" title="${d.insight.detail}">${d.insight.status}</span>`;
        }

        feed.innerHTML += `
            <div onclick="searchAndPlay('${escapeAttr(d.Com_Name)}', '${escapeAttr(d.Sci_Name)}', '${d.Date}', '${d.Time}', '${pct}')" class="flex justify-between items-center bg-[var(--bn-panel)] p-3 rounded-lg border border-[var(--bn-border)] cursor-pointer hover:bg-[var(--bn-bg)] transition-colors group">
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
}

// --- DATABASE EXPLORER V2 (PAGINATED) ---
let dbCurrentPage = 0;
const dbPageSize = 50;
let dbIsLoading = false;
let dbHasMore = true;
let currentDbQuery = {};

document.getElementById('tab-database').addEventListener('scroll', (e) => {
    const el = e.target;
    if (!dbIsLoading && dbHasMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
        fetchPaginatedDetections(false);
    }
});

function searchDatabase() {
    currentDbQuery = {
        sp: document.getElementById('db-filter-species').value,
        dStart: document.getElementById('db-filter-date-start').value,
        dEnd: document.getElementById('db-filter-date-end').value,
        tStart: document.getElementById('db-filter-time-start').value,
        tEnd: document.getElementById('db-filter-time-end').value,
        minConf: parseFloat(document.getElementById('db-filter-conf').value)
    };
    fetchPaginatedDetections(true); 
}

async function fetchPaginatedDetections(isNewSearch = false) {
    if (dbIsLoading) return;
    if (isNewSearch) {
        dbCurrentPage = 0;
        dbHasMore = true;
        document.getElementById('db-table-body').innerHTML = '';
    }
    if (!dbHasMore) return;

    dbIsLoading = true;
    document.getElementById('db-results-count').innerText = 'Loading...';

    const offset = dbCurrentPage * dbPageSize;
    const { sp, dStart, dEnd, tStart, tEnd, minConf } = currentDbQuery;

    const params = new URLSearchParams({
        limit: dbPageSize,
        offset: offset
    });

    if (sp && sp !== 'all') params.append('sp', sp);
    if (dStart) params.append('dStart', dStart);
    if (dEnd) params.append('dEnd', dEnd);
    if (tStart) params.append('tStart', tStart);
    if (tEnd) params.append('tEnd', tEnd);
    if (minConf) params.append('minConf', minConf);
    
    try {
        const res = await fetch(API_BASE + `/api/detections?${params.toString()}`);
        const payload = await res.json();
        const data = payload.detections;
        const totalCount = payload.total_count;

        if (data.length < dbPageSize) {
            dbHasMore = false;
        }

        appendDbRows(data);
        dbCurrentPage++;
        
        const totalShowing = document.getElementById('db-table-body').rows.length;
        document.getElementById('db-results-count').innerText = `Showing ${totalShowing} of ${totalCount.toLocaleString()} results ${!dbHasMore ? '(End of List)' : ''}`;

    } catch (e) {
        console.error("Failed to load paginated detections", e);
        document.getElementById('db-results-count').innerText = 'Error loading data.';
    } finally {
        dbIsLoading = false;
    }
}

function appendDbRows(data) {
    const tbody = document.getElementById('db-table-body');
    if(data.length === 0 && dbCurrentPage === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No detections found matching these filters.</td></tr>`;
        return;
    }

    const rowsHtml = data.map(d => {
        const pct = (d.Confidence * 100).toFixed(0);
        let insightBadge = '';
        if (d.insight && d.insight.status !== 'Normal') {
            const badgeClass = d.insight.status === 'New' ? 'insight-new' : 'insight-rare';
            insightBadge = `<span class="insight-badge ${badgeClass}" title="${d.insight.detail}">${d.insight.status}</span>`;
        }

        return `<tr class="hover:bg-[var(--bn-bg)] transition-colors border-b border-[var(--bn-border)]">
            <td class="p-3 text-slate-300">${d.Date}</td>
            <td class="p-3 text-slate-300">${d.Time}</td>
            <td class="p-3 font-bold text-white">${d.Com_Name}${insightBadge}</td>
            <td class="p-3 text-slate-400 italic">${d.Sci_Name}</td>
            <td class="p-3 text-[var(--bn-highlight)] font-mono">${pct}%</td>
            <td class="p-3 text-right">
                <button onclick="searchAndPlay('${escapeAttr(d.Com_Name)}', '${escapeAttr(d.Sci_Name)}', '${d.Date}', '${d.Time}', '${pct}')" class="text-[var(--bn-highlight)] hover:text-white transition-colors" title="Play Audio">
                    <svg class="w-6 h-6 inline" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.innerHTML += rowsHtml;
}

function populateDatabaseFilter() {
    const speciesSet = new Set(dbData.map(d => d.Com_Name).filter(Boolean));
    const dataList = document.getElementById('species-list-options');
    
    const inputEl = document.getElementById('db-filter-species');
    inputEl.placeholder = `Search among ${speciesSet.size} species...`;
    
    dataList.innerHTML = Array.from(speciesSet).sort().map(s => `<option value="${s.replace(/"/g, '&quot;')}"></option>`).join('');
}

function filterDatabase() {
    searchDatabase();
}

function renderDatabaseTable(data) {
    console.warn("renderDatabaseTable is deprecated for paginated view.");
}

document.querySelector('#tab-database button[onclick="filterDatabase()"]').setAttribute('onclick', 'searchDatabase()');

function exportDatabaseCSV() {
    const data = window.currentDbExport || dbData;
    if(data.length === 0) return alert("No data to export.");
    
    const headers = ["Date", "Time", "Sci_Name", "Com_Name", "Confidence"];
    const csvRows = [headers.join(',')];
    
    data.forEach(d => {
        csvRows.push(`${d.Date},${d.Time},"${d.Sci_Name}","${d.Com_Name}",${d.Confidence}`);
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `BirdNET_Export_${getTodayStr()}.csv`);
    a.click();
}

let currentAnalyticsMode = 'acc';
function switchAnalytics(mode, buttonEl) {
    currentAnalyticsMode = mode;
    document.querySelectorAll('#tab-analytics .toggle-btn').forEach(b => b.classList.remove('active'));
    
    const targetBtn = buttonEl || document.querySelector(`#tab-analytics .toggle-btn[onclick*="${mode}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    
    const uToggle = document.getElementById('weather-unit-toggle');
    const hContainer = document.getElementById('analytics-health-container');
    const cContainer = document.getElementById('analytics-chart-container');

    if (uToggle) uToggle.classList.toggle('hidden', mode !== 'weather');
    
    if (mode === 'health') {
        if (cContainer) cContainer.classList.add('hidden');
        if (hContainer) hContainer.classList.remove('hidden');
        const days = document.getElementById('global-date-filter').value;
        const filtered = filterDataByDays(dbData, days);
        renderDiagnostics(filtered);
    } else {
        if (hContainer) hContainer.classList.add('hidden');
        if (cContainer) cContainer.classList.remove('hidden');
        renderAnalytics();
    }
}

document.getElementById('unit-metric').addEventListener('click', (e) => { 
    isMetric = true; 
    e.target.className="px-2 py-1 rounded text-xs font-bold bg-[var(--bn-highlight)] text-[#122617] transition-colors"; 
    document.getElementById('unit-imperial').className="px-2 py-1 rounded text-xs font-bold text-slate-300 hover:text-white transition-colors"; 
    switchAnalytics('weather', e.target.closest('.toggle-btn')); 
});
document.getElementById('unit-imperial').addEventListener('click', (e) => { 
    isMetric = false; 
    e.target.className="px-2 py-1 rounded text-xs font-bold bg-[var(--bn-highlight)] text-[#122617] transition-colors"; 
    document.getElementById('unit-metric').className="px-2 py-1 rounded text-xs font-bold text-slate-300 hover:text-white transition-colors"; 
    switchAnalytics('weather', e.target.closest('.toggle-btn')); 
});

async function renderAnalytics() {
    try {
        const days = document.getElementById('global-date-filter').value;
        if (activeChart) { activeChart.destroy(); activeChart = null; }
        const ctx = document.getElementById('analytics-chart').getContext('2d');
        
        const darkThemeScales = {
            x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
            y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
        };

        if (currentAnalyticsMode === 'matrix') {
            const filtered = filterDataByDays(dbData, days);
            const spCounts = {};
            filtered.forEach(d => spCounts[d.Com_Name] = (spCounts[d.Com_Name] || 0) + 1);
            const topSp = Object.entries(spCounts).sort((a, b) => b[1] - a[1]).slice(0, 25).map(x => x[0]);

            const bData = []; let gMax = 0; const wMap = {};
            filtered.forEach(d => {
                if (topSp.includes(d.Com_Name) && d.Time) {
                    const h = parseInt(d.Time.split(':')[0], 10);
                    const k = `${d.Com_Name}-${h}`;
                    wMap[k] = (wMap[k] || 0) + 1;
                    if (wMap[k] > gMax) gMax = wMap[k];
                }
            });

            topSp.forEach((sp, yIdx) => {
                for (let h = 0; h < 24; h++) {
                    const v = wMap[`${sp}-${h}`];
                    if (v) bData.push({ x: h, y: yIdx, r: Math.max(3, (v / gMax) * 15), _v: v });
                }
            });

            activeChart = new Chart(ctx, {
                type: 'bubble',
                data: { datasets: [{ data: bData, backgroundColor: 'rgba(74, 222, 128, 0.7)', borderColor: '#4ade80', borderWidth: 1 }] },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${topSp[c.raw.y]} at ${c.raw.x}:00 = ${c.raw._v} hits` } } },
                    scales: {
                        y: { ...darkThemeScales.y, ticks: { callback: v => topSp[v], color: '#cbd5e1' }, reverse: true, min: -0.5, max: topSp.length - 0.5 },
                        x: { ...darkThemeScales.x, min: -1, max: 24 }
                    }
                }
            });
            return;
        }

        const statsRes = await fetch(API_BASE + `/api/detections/stats?days=${days}`);
        const statsData = await statsRes.json();
        if (!statsData || typeof statsData !== 'object') { throw new Error("Invalid stats payload"); }
        
        const dailyData = statsData.detections_by_date || {};

        if (currentAnalyticsMode === 'acc') {
            const uniqueSpeciesByDate = statsData.species_by_date || {};
            let sortedDates = Object.keys(uniqueSpeciesByDate).sort();
            
            const labels = [];
            const counts = [];
            const seen = new Set();
            
            if (sortedDates.length === 1) {
                const singleDate = new Date(sortedDates[0]);
                const prevDate = new Date(singleDate);
                prevDate.setDate(singleDate.getDate() - 1);
                labels.push(`${prevDate.toLocaleString('default', { month: 'short' })} ${prevDate.getDate()}`);
                counts.push(0);
            }

            sortedDates.forEach(date => {
                const d = new Date(date + 'T00:00:00');
                labels.push(`${d.toLocaleString('default',{month:'short'})} ${d.getDate()}`);
                (uniqueSpeciesByDate[date] || []).forEach(species => seen.add(species));
                counts.push(seen.size);
            });

            activeChart = new Chart(ctx, {
                type: 'line',
                data: { labels: labels, datasets: [{ label: 'Total Unique Species', data: counts, borderColor: '#4ade80', backgroundColor: 'rgba(74, 222, 128, 0.15)', fill: true, tension: 0.4, pointRadius: 2 }] },
                options: { 
                    responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, 
                    scales: {
                        x: darkThemeScales.x,
                        y: { ...darkThemeScales.y, beginAtZero: true, suggestedMax: Math.max(...counts) + 2 }
                    }
                }
            });
        }
        else if (currentAnalyticsMode === 'weather') {
            const sortedDates = Object.keys(dailyData).sort();
            const dets = sortedDates.map(dt => dailyData[dt] || 0);
            const niceLabels = sortedDates.map(l => { const d = new Date(l + 'T00:00:00'); return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`; });

            try {
                if (sortedDates.length === 0) throw new Error("No dates for weather fetch");

                const lat = configData.LATITUDE || '41.9'; const lon = configData.LONGITUDE || '-73.1';
                const s = sortedDates[0]; const e = sortedDates[sortedDates.length - 1];
                const unitT = isMetric ? 'celsius' : 'fahrenheit';
                const unitR = isMetric ? 'mm' : 'inch';
                const unitW = isMetric ? 'kmh' : 'mph';

                const weatherRes = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${s}&end_date=${e}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max&timezone=auto&temperature_unit=${unitT}&windspeed_unit=${unitW}&precipitation_unit=${unitR}`);
                const wData = await weatherRes.json();

                const rains = [];
                const temps = sortedDates.map(dt => {
                    const idx = wData.daily.time.indexOf(dt);
                    rains.push(idx > -1 ? wData.daily.precipitation_sum[idx] : null);
                    return idx > -1 ? wData.daily.temperature_2m_max[idx] : null;
                });
                const winds = sortedDates.map(dt => {
                    const idx = wData.daily.time.indexOf(dt);
                    return idx > -1 ? wData.daily.windspeed_10m_max[idx] : null;
                });
                const maxRain = Math.max(...rains.filter(r => r !== null));
                
                activeChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: niceLabels,
                        datasets: [
                            { type: 'bar', label: 'Detections', data: dets, backgroundColor: 'rgba(74, 222, 128, 0.8)', yAxisID: 'y', maxBarThickness: 24, categoryPercentage: 0.7, barPercentage: 0.8 },
                            { type: 'line', label: `Max Temp (${isMetric ? '°C' : '°F'})`, data: temps, borderColor: '#f87171', tension: 0.4, pointRadius: 2, yAxisID: 'yT' },
                            { type: 'line', label: `Max Wind (${isMetric ? 'km/h' : 'mph'})`, data: winds, borderColor: '#9ca3af', borderDash: [4, 4], tension: 0.3, pointRadius: 0, yAxisID: 'yT' },
                            { type: 'bar', label: `Rain (${isMetric ? 'mm' : 'in'})`, data: rains, backgroundColor: 'rgba(96, 165, 250, 0.6)', yAxisID: 'yR', maxBarThickness: 24, categoryPercentage: 0.7, barPercentage: 0.8 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                        plugins: { legend: { labels: { color: '#cbd5e1' } } },
                        scales: {
                            x: { ...darkThemeScales.x, stacked: true },
                            y: { ...darkThemeScales.y, stacked: true, position: 'left', beginAtZero: true },
                            yT: { position: 'right', grid: { display: false }, ticks: { color: '#cbd5e1' } },
                            yR: { display: false, beginAtZero: true, max: Math.max(1, maxRain * 1.5) }
                        }
                    }
                });

            } catch (e) {
                console.error("Weather API failed, rendering fallback chart:", e);
                activeChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: niceLabels,
                        datasets: [{ label: 'Detections', data: dets, backgroundColor: 'rgba(74, 222, 128, 0.8)', maxBarThickness: 36 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: darkThemeScales }
                });
            }
        }
    } catch (e) {
        console.error('Analytics render error:', e);
    }
}

function renderDiagnostics(data) {
    const container = document.getElementById('health-stats');
    container.innerHTML = '';
    if(!data || data.length === 0) return;

    const total = data.length;
    const days = new Set(data.map(d => d.Date)).size || 1;
    const avgDaily = (total / days).toFixed(1);
    
    const hourCounts = Array(24).fill(0);
    data.forEach(d => {
        if (d.Time) {
            const hr = parseInt(d.Time.split(':')[0], 10);
            if (!isNaN(hr)) hourCounts[hr]++;
        }
    });
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const ampm = peakHour >= 12 ? 'PM' : 'AM';
    const displayHour = peakHour % 12 || 12;

    container.innerHTML = `
        <div class="bg-[var(--bn-bg)] p-4 rounded border border-[var(--bn-border)]">
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-300">Average Daily Volume</span>
                <span class="font-mono font-bold text-[var(--bn-highlight)]">${avgDaily} / day</span>
            </div>
            <p class="text-xs text-slate-400">Average detections based on the selected timeframe.</p>
        </div>
        <div class="bg-[var(--bn-bg)] p-4 rounded border border-[var(--bn-border)]">
            <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-300">Peak Activity Hour</span>
                <span class="font-mono font-bold text-[var(--bn-highlight)]">${displayHour}:00 ${ampm}</span>
            </div>
            <p class="text-xs text-slate-400">The most active time of day for detections.</p>
        </div>
    `;
}

async function fetchGallery() {
    try {
        const res = await fetch(API_BASE + '/api/gallery');
        const data = await res.json();
        galleryCacheRecent = data.recent || [];
        galleryCacheBest = data.best || [];
        switchGallery('recent', document.querySelector('#tab-gallery .toggle-btn'));
    } catch(e) {
        console.error("Failed to fetch gallery:", e);
    }
}

function switchGallery(mode, buttonEl) {
    document.querySelectorAll('#tab-gallery > div > .toggle-btn:not(.sort-btn)').forEach(b => b.classList.remove('active'));
    if(buttonEl) buttonEl.classList.add('active');
    
    ['recent', 'today', 'best'].forEach(t => document.getElementById(`gallery-${t}`).classList.add('hidden'));
    document.getElementById(`gallery-${mode}`).classList.remove('hidden');

    if (mode === 'recent') renderGalleryGrid(galleryCacheRecent, 'gallery-recent');
    if (mode === 'today') renderGalleryToday();
    if (mode === 'best') renderBestRecordings();
}

function renderGalleryGrid(files, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!files || files.length === 0) {
        container.innerHTML = '<p class="text-slate-400 text-sm p-4">No recordings found for this view.</p>';
        return;
    }
    files.slice(0, 100).forEach(f => {
        const pct = (f.confidence * 100).toFixed(0);
        const dbMatch = dbData.find(d => d.Com_Name === f.species);
        const sciName = dbMatch ? dbMatch.Sci_Name : '';
        
        container.innerHTML += `
            <div class="bird-card p-4 hover:bg-[var(--bn-bg)] transition-colors cursor-pointer flex flex-col group" onclick="openDetectionModal('${escapeAttr(f.filepath)}', '${escapeAttr(f.species)}', '${escapeAttr(sciName)}', '${pct}', '${escapeAttr(f.filename)}')">
                <div class="flex justify-between items-start mb-4">
                    <h4 class="text-white font-bold text-sm leading-tight group-hover:text-[var(--bn-highlight)] transition-colors">${f.species}</h4>
                    <span class="text-xs font-mono px-2 py-1 bg-[var(--bn-panel)] border border-[var(--bn-border)] rounded text-[var(--bn-highlight)]">${pct}%</span>
                </div>
                <div class="mt-auto flex justify-between items-center border-t border-[var(--bn-border)] pt-3">
                    <span class="text-[10px] text-slate-300">${f.date_str}</span>
                    <div class="flex items-center gap-1 text-[var(--bn-highlight)] text-xs font-bold uppercase"><svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg> PLAY</div>
                </div>
            </div>
        `;
    });
}

function renderGalleryToday() {
    const tbody = document.getElementById('gallery-today-body');
    tbody.innerHTML = '';
    const todayStr = getTodayStr();
    const tData = dbData.filter(d => d.Date === todayStr);
    const stats = {};
    tData.forEach(d => {
        if(!stats[d.Com_Name]) stats[d.Com_Name] = { c: 0, last: d.Time, sci: d.Sci_Name };
        stats[d.Com_Name].c++;
        if(d.Time > stats[d.Com_Name].last) stats[d.Com_Name].last = d.Time;
    });
    Object.entries(stats).sort((a,b)=>b[1].c - a[1].c).forEach(([sp, d]) => {
        tbody.innerHTML += `<tr class="hover:bg-[var(--bn-bg)] transition-colors cursor-pointer border-b border-[var(--bn-border)]" onclick="searchAndPlay('${escapeAttr(sp)}', '${escapeAttr(d.sci)}', '${todayStr}', '${d.last}', '')"><td class="p-4 font-bold text-white">${sp}</td><td class="p-4 text-slate-300">${d.c}</td><td class="p-4 text-slate-300">${d.last}</td></tr>`;
    });
}

document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentBestSort = e.target.getAttribute('data-sort');
        renderBestRecordings();
    });
});

function renderBestRecordings() {
    let bestArr = [...galleryCacheBest];
    if (currentBestSort === 'name') bestArr.sort((a, b) => a.species.localeCompare(b.species));
    else if (currentBestSort === 'hits') {
        const hitCounts = {}; dbData.forEach(d => hitCounts[d.Com_Name] = (hitCounts[d.Com_Name] || 0) + 1);
        bestArr.sort((a, b) => (hitCounts[b.species] || 0) - (hitCounts[a.species] || 0));
    } 
    else if (currentBestSort === 'conf') bestArr.sort((a, b) => b.confidence - a.confidence);
    else if (currentBestSort === 'date') bestArr.sort((a, b) => b.mtime - a.mtime);
    renderGalleryGrid(bestArr, 'gallery-best-grid');
}

function updateCompilerSuggestions() {
    const tf = document.getElementById('compiler-timeframe').value;
    let filtered = [];
    
    if (tf === 'custom') {
        const start = document.getElementById('comp-date-start').value;
        const end = document.getElementById('comp-date-end').value;
        if (start && end) {
            filtered = dbData.filter(d => d.Date >= start && d.Date <= end);
        } else {
            return; 
        }
    } else {
        filtered = filterDataByDays(dbData, tf);
    }
    
    const counts = {};
    filtered.forEach(d => { counts[d.Com_Name] = (counts[d.Com_Name] || 0) + 1; });
    
    const topSpecies = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const container = document.getElementById('compiler-suggestions');
    container.innerHTML = '';
    
    topSpecies.forEach(([species, count]) => {
        container.innerHTML += `
            <div class="bird-card p-6 bg-[var(--bn-panel)] hover:bg-[var(--bn-bg)] cursor-pointer transition-colors border border-[var(--bn-border)] group" onclick="triggerCompile('${species}')">
                <h4 class="text-white font-bold text-lg mb-1 group-hover:text-[var(--bn-highlight)] transition-colors">${species}</h4>
                <p class="text-slate-400 text-sm mb-4">${count} Detections</p>
                <button class="text-xs font-bold bg-[var(--bn-highlight)] text-[#111a14] px-3 py-1.5 rounded flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Generate Mix
                </button>
            </div>
        `;
    });
    
    const select = document.getElementById('compile-species');
    const allSpecies = Object.keys(counts).sort();
    select.innerHTML = '<option value="">Select a species...</option>' + allSpecies.map(sp => `<option value="${sp}">${sp}</option>`).join('');
}

document.getElementById('compiler-timeframe').addEventListener('change', (e) => {
    const customWrapper = document.getElementById('compiler-custom-dates');
    if (e.target.value === 'custom') {
        customWrapper.classList.remove('hidden');
        customWrapper.classList.add('flex');
    } else {
        customWrapper.classList.add('hidden');
        customWrapper.classList.remove('flex');
        updateCompilerSuggestions();
    }
});

document.getElementById('comp-date-start').addEventListener('change', updateCompilerSuggestions);
document.getElementById('comp-date-end').addEventListener('change', updateCompilerSuggestions);

function triggerCompile(species) {
    document.getElementById('compile-species').value = species;
    document.getElementById('compile-btn').click();
}

document.getElementById('compile-btn').addEventListener('click', async () => {
    const species = document.getElementById('compile-species').value;
    const conf = parseFloat(document.getElementById('compile-conf').value);
    if(!species) return alert('Select a species first');
    
    const btn = document.getElementById('compile-btn');
    const status = document.getElementById('compile-status');
    
    btn.disabled = true;
    btn.innerText = 'Compiling...';
    status.classList.remove('hidden', 'text-green-400', 'text-red-400');
    status.classList.add('text-yellow-400');
    status.innerText = 'Stitching audio files via FFmpeg...';
    
    let start_date = "";
    let end_date = "";
    const tf = document.getElementById('compiler-timeframe').value;
    
    if (tf === 'custom') {
        start_date = document.getElementById('comp-date-start').value;
        end_date = document.getElementById('comp-date-end').value;
    } else if (tf !== 'all') {
        const d = new Date();
        end_date = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - parseInt(tf));
        start_date = d.toISOString().split('T')[0];
    }

    try {
        const res = await fetch(API_BASE + '/api/compile', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                species: species, 
                min_conf: conf, 
                limit: 25, 
                start_date: start_date, 
                end_date: end_date
            })
        });
        
        if (res.status === 202) {
            const data = await res.json();
            status.classList.replace('text-yellow-400', 'text-green-400');
            status.innerText = data.message || "Compilation started. Mixes will appear in the 'mixes' folder.";
        } else {
            const errorData = await res.json().catch(() => ({ detail: 'Unknown error structure' }));
            throw new Error(errorData.detail || 'Compilation request failed.');
        }
    } catch(e) {
        status.classList.replace('text-yellow-400', 'text-red-400');
        status.innerText = e.message || 'Server error during compilation.';
    } finally {
        btn.disabled = false;
        btn.innerText = 'Compile Audio';
    }
});

const modalAudioEl = document.getElementById('modal-audio');

function initWebAudioAPI() {
    if (isAudioSetup) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    
    trackNode = audioCtx.createMediaElementSource(modalAudioEl);
    
    highpassNode = audioCtx.createBiquadFilter();
    highpassNode.type = 'highpass';
    highpassNode.frequency.value = 0;
    
    lowpassNode = audioCtx.createBiquadFilter();
    lowpassNode.type = 'lowpass';
    lowpassNode.frequency.value = 24000;
    
    gainNode = audioCtx.createGain();
    
    trackNode.connect(highpassNode);
    highpassNode.connect(lowpassNode);
    highpassNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    isAudioSetup = true;
}

let liveAudioCtx, liveAnalyser, liveSource, liveDataArray;
let isLiveAudioSetup = false;
let liveAnimId;
const liveCanvas = document.getElementById('live-spectro-canvas');
const liveCtx = liveCanvas.getContext('2d');

function initLiveSpectrogram() {
    if (isLiveAudioSetup) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    liveAudioCtx = new AudioContext();
    liveAnalyser = liveAudioCtx.createAnalyser();
    liveAnalyser.fftSize = 512; 
    const sbAudio = document.getElementById('sidebar-audio');
    
    liveSource = liveAudioCtx.createMediaElementSource(sbAudio);
    liveSource.connect(liveAnalyser);
    liveAnalyser.connect(liveAudioCtx.destination);
    
    liveDataArray = new Uint8Array(liveAnalyser.frequencyBinCount);
    isLiveAudioSetup = true;
    
    liveCanvas.width = liveCanvas.offsetWidth;
    liveCanvas.height = liveCanvas.offsetHeight;
}

function drawLiveSpectrogram() {
    if (!document.getElementById('sidebar-audio').paused) {
        liveAnimId = requestAnimationFrame(drawLiveSpectrogram);
        liveAnalyser.getByteFrequencyData(liveDataArray);
        
        const w = liveCanvas.width;
        const h = liveCanvas.height;
        
        const imgData = liveCtx.getImageData(1, 0, w - 1, h);
        liveCtx.putImageData(imgData, 0, 0);
        
        const validBins = Math.floor(liveDataArray.length * 0.75);
        const binHeight = h / validBins;
        
        for (let i = 0; i < validBins; i++) {
            const val = liveDataArray[i];
            const r = val > 128 ? 255 : val * 2;
            const g = val > 192 ? 255 : (val > 128 ? (val - 128) * 2 : 0);
            const b = val > 200 ? 255 : (val < 128 ? val : 0);
            
            liveCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            liveCtx.fillRect(w - 1, h - (i * binHeight), 1, binHeight);
        }
    } else {
        cancelAnimationFrame(liveAnimId);
    }
}

async function fetchBirdImage(species) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(species)}&prop=pageimages&format=json&pithumbsize=800&redirects=1&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId !== "-1" && pages[pageId].thumbnail) return pages[pageId].thumbnail.source;
    } catch (e) {}
    return null;
}

function openLightbox() {
    const imgSrc = document.getElementById('modal-bird-img').src;
    if (imgSrc && !imgSrc.endsWith('.html')) {
        document.getElementById('lightbox-img').src = imgSrc;
        document.getElementById('lightbox').classList.remove('hidden');
    }
}

function toggleModalAudioPlayback() {
    document.getElementById('modal-play-btn').click();
}

async function openDetectionModal(url, species, sciName, conf, fname) {
    document.getElementById('detection-modal').classList.remove('hidden');
    
    document.getElementById('modal-title').innerText = species;
    document.getElementById('modal-sciname').innerText = sciName || '';
    document.getElementById('modal-conf').innerText = `${conf}%`;
    document.getElementById('modal-filename').innerText = fname;
    
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(sciName || species)}`;
    const aabUrl = `https://www.allaboutbirds.org/guide/${species.replace(/ /g, '_')}`;
    document.getElementById('modal-wiki-link').href = wikiUrl;
    document.getElementById('modal-aab-link').href = aabUrl;
    
    const imgEl = document.getElementById('modal-bird-img');
    const placeholder = document.getElementById('modal-img-placeholder');
    imgEl.classList.add('hidden');
    placeholder.classList.remove('hidden');
    fetchBirdImage(sciName || species).then(imgUrl => {
        if(imgUrl) { imgEl.src = imgUrl; imgEl.classList.remove('hidden'); placeholder.classList.add('hidden'); }
        else {
            fetchBirdImage(species).then(imgUrl2 => {
                if(imgUrl2) { imgEl.src = imgUrl2; imgEl.classList.remove('hidden'); placeholder.classList.add('hidden'); }
            });
        }
    });
    
    const cleanUrl = url.startsWith('/') ? url : '/' + url;
    modalAudioEl.src = cleanUrl;
    document.getElementById('modal-download').href = cleanUrl;
    
    document.getElementById('modal-icon-play').classList.remove('hidden');
    document.getElementById('modal-icon-pause').classList.add('hidden');
    
    document.querySelectorAll('#gain-controls .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#gain-controls .filter-btn[data-val="1"]').classList.add('active');
    
    document.querySelectorAll('#hp-controls .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#hp-controls .filter-btn[data-val="0"]').classList.add('active');

    document.querySelectorAll('#lp-controls .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#lp-controls .filter-btn[data-val="24000"]').classList.add('active');
    
    if (isAudioSetup) {
        gainNode.gain.value = 1;
        highpassNode.frequency.value = 0;
        lowpassNode.frequency.value = 24000;
    }

    const imgPath = cleanUrl.substring(0, cleanUrl.lastIndexOf('.')) + '.png';
    const specImg = document.getElementById('modal-spectro-img');
    const specErr = document.getElementById('modal-spectro-error');
    specImg.dataset.retried = 'false';
    specImg.src = imgPath;
    
    specImg.onload = () => { 
        specImg.classList.remove('hidden'); 
        specErr.classList.add('hidden'); 
    };
    
    specImg.onerror = () => { 
        if (specImg.dataset.retried === 'false') {
            specImg.dataset.retried = 'true';
            specImg.src = cleanUrl + '.png'; 
        } else {
            specImg.classList.add('hidden'); 
            specErr.classList.remove('hidden'); 
        }
    };

    document.getElementById('modal-spectro-img').parentElement.onclick = toggleModalAudioPlayback;

    document.getElementById('history-popover').classList.add('hidden');
    drawModalHistoryChart(species, document.getElementById('history-timeframe').value);

    document.getElementById('modal-progress').style.width = '0%';
    document.getElementById('modal-playhead').style.left = '0%';
    document.getElementById('modal-time').innerText = '0:00';
    cancelAnimationFrame(animationFrameId);
}

async function drawModalHistoryChart(species, days = '30') {
    const ctx = document.getElementById('modal-history-chart').getContext('2d');
    if (modalChart) modalChart.destroy();
    
    const statsRes = await fetch(API_BASE + `/api/detections/stats?days=${days}&species_of_interest=${encodeURIComponent(species)}`);
    const statsData = await statsRes.json();
    const daily = statsData.species_by_date ? (statsData.species_by_date[species] || {}) : {};

    const labels = []; 
    const data = [];
    const daysToParse = (days === 'all') ? 365 : parseInt(days); // Limit 'all' to a year for performance

    let curr = new Date();
    curr.setDate(curr.getDate() - daysToParse);

    while (curr <= new Date()) {
        const dStr = curr.toISOString().split('T')[0];
        labels.push(`${curr.toLocaleString('default',{month:'short'})} ${curr.getDate()}`);
        data.push(daily[dStr] || 0);
        curr.setDate(curr.getDate() + 1);
    }
    
    modalChart = new Chart(ctx, {
        type: 'bar', 
        data: { 
            labels: labels, 
            datasets: [{ 
                data: data, 
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                maxBarThickness: 16,
                categoryPercentage: 0.8,
                barPercentage: 0.9
            }] 
        },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false }, tooltip: { enabled: true } }, 
            scales: { 
                x: { 
                    ticks: { 
                        color: '#cbd5e1',
                        // Auto-skip ticks to prevent overlap on small charts
                        autoSkip: true,
                        maxTicksLimit: 6
                    } 
                }, 
                y: { display: false, min: 0 } 
            } 
        }
    });
}

// BULLETPROOF SEARCH AND PLAY FALLBACK
async function searchAndPlay(species, sciName, date, time, pct) {
    try {
        if (galleryCacheRecent.length === 0) {
            await fetchGallery().catch(() => {}); // Non-blocking gallery fetch
        }
    } catch (e) {
        console.warn("Gallery cache lookup skipped:", e);
    }

    const timeStr = time ? time.replace(/:/g, '') : '';
    const found = galleryCacheRecent.find(f => 
        f.species === species && 
        f.filename && f.filename.includes(date) && 
        f.filename.replace(/:/g, '').includes(timeStr.substring(0, 4))
    );
    
    if (found) {
        openDetectionModal(found.filepath, found.species, sciName, (found.confidence * 100).toFixed(0), found.filename);
    } else {
        // Immediate fallback: construct the expected audio path directly so the modal always opens
        const sanitizedSpecies = species.replace(/\s+/g, '_');
        const fallbackFilename = `${sanitizedSpecies}-${pct}-${date}-${time ? time.replace(/:/g, '-') : ''}.mp3`;
        const fallbackPath = `${date}/${fallbackFilename}`;
        openDetectionModal(fallbackPath, species, sciName, pct, fallbackFilename);
    }
}

function closeModal() {
    document.getElementById('detection-modal').classList.add('hidden');
    document.getElementById('history-popover').classList.add('hidden');
    modalAudioEl.pause();
    cancelAnimationFrame(animationFrameId);
}

function updatePlayhead() {
    if (!modalAudioEl.paused && modalAudioEl.duration) {
        const pct = (modalAudioEl.currentTime / modalAudioEl.duration) * 100;
        document.getElementById('modal-progress').style.width = `${pct}%`;
        document.getElementById('modal-playhead').style.left = `${pct}%`;
        document.getElementById('modal-time').innerText = `${Math.floor(modalAudioEl.currentTime)}:${String(Math.floor((modalAudioEl.currentTime%1)*60)).padStart(2,'0')}`;
        animationFrameId = requestAnimationFrame(updatePlayhead);
    }
}

document.getElementById('modal-play-btn').addEventListener('click', () => {
    initWebAudioAPI(); 
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    
    if(modalAudioEl.paused) {
        modalAudioEl.play();
        document.getElementById('modal-icon-play').classList.add('hidden');
        document.getElementById('modal-icon-pause').classList.remove('hidden');
        animationFrameId = requestAnimationFrame(updatePlayhead);
    } else {
        modalAudioEl.pause();
        document.getElementById('modal-icon-play').classList.remove('hidden');
        document.getElementById('modal-icon-pause').classList.add('hidden');
        cancelAnimationFrame(animationFrameId);
    }
});

document.getElementById('modal-progress-container').addEventListener('click', (e) => {
    if(modalAudioEl.duration) {
        const rect = e.target.getBoundingClientRect();
        modalAudioEl.currentTime = ((e.clientX - rect.left) / rect.width) * modalAudioEl.duration;
        const pct = (modalAudioEl.currentTime / modalAudioEl.duration) * 100;
        document.getElementById('modal-progress').style.width = `${pct}%`;
        document.getElementById('modal-playhead').style.left = `${pct}%`;
    }
});

modalAudioEl.addEventListener('ended', () => {
    document.getElementById('modal-icon-play').classList.remove('hidden');
    document.getElementById('modal-icon-pause').classList.add('hidden');
    document.getElementById('modal-playhead').style.left = '0%';
    document.getElementById('modal-progress').style.width = '0%';
    cancelAnimationFrame(animationFrameId);
});

document.querySelectorAll('#gain-controls .filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#gain-controls .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (isAudioSetup) gainNode.gain.value = parseFloat(e.target.dataset.val);
    });
});

document.querySelectorAll('#hp-controls .filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#hp-controls .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (isAudioSetup) highpassNode.frequency.value = parseFloat(e.target.dataset.val);
    });
});

document.querySelectorAll('#lp-controls .filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('#lp-controls .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (isAudioSetup) lowpassNode.frequency.value = parseFloat(e.target.dataset.val);
    });
});

document.getElementById('modal-stats-btn').addEventListener('click', () => {
    const popover = document.getElementById('history-popover');
    if (popover.classList.contains('hidden')) {
        popover.classList.remove('hidden');
        if (modalChart) modalChart.resize();
    } else {
        popover.classList.add('hidden');
    }
});

document.getElementById('history-timeframe').addEventListener('change', (e) => {
    drawModalHistoryChart(document.getElementById('modal-title').innerText, e.target.value);
});

let audioInactivityTimer;
const audioPanel = document.getElementById('audio-panel-container');
const controlBar = document.getElementById('audio-control-bar');
const settingsPopup = document.getElementById('modal-settings-popup');

audioPanel.addEventListener('mousemove', () => {
    controlBar.classList.remove('opacity-0');
    clearTimeout(audioInactivityTimer);
    if(settingsPopup.classList.contains('hidden')) {
        audioInactivityTimer = setTimeout(() => {
            controlBar.classList.add('opacity-0');
        }, 2500);
    }
});

audioPanel.addEventListener('mouseleave', () => {
    if(settingsPopup.classList.contains('hidden')) {
        controlBar.classList.add('opacity-0');
    }
    clearTimeout(audioInactivityTimer);
});

document.getElementById('modal-settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPopup.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!settingsPopup.classList.contains('hidden') && !e.target.closest('#modal-settings-popup') && !e.target.closest('#modal-settings-btn')) {
        settingsPopup.classList.add('hidden');
        audioInactivityTimer = setTimeout(() => {
            controlBar.classList.add('opacity-0');
        }, 2500);
    }
});

document.getElementById('sidebar-audio-btn').addEventListener('click', () => {
    const audio = document.getElementById('sidebar-audio');
    const btn = document.getElementById('sidebar-audio-btn');
    const dot = document.getElementById('stream-status-dot');
    
    if (audio.paused || !audio.src) {
        audio.src = API_BASE + '/api/stream';
        audio.play().then(() => {
            btn.innerHTML = 'Disconnect';
            btn.classList.add('bg-red-600', 'text-white');
            dot.classList.replace('bg-slate-500', 'bg-[#4ade80]');
            dot.classList.add('animate-pulse');
            initLiveSpectrogram();
            drawLiveSpectrogram();
        }).catch(e => {
            dot.classList.replace('bg-slate-500', 'bg-yellow-500');
        });
    } else {
        audio.pause();
        audio.src = '';
        btn.innerHTML = 'Connect Audio';
        btn.classList.remove('bg-red-600', 'text-white');
        dot.classList.replace('bg-[#4ade80]', 'bg-slate-500');
        dot.classList.remove('animate-pulse');
        cancelAnimationFrame(liveAnimId);
        liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
    }
});

async function updateSystemStats() {
    try {
        const res = await fetch(API_BASE + '/api/system');
        const data = await res.json();
        
        const displayTemp = isMetric ? data.temp : (data.temp * 9/5) + 32;
        document.getElementById('sys-temp').innerHTML = `${displayTemp.toFixed(1)}&deg;${isMetric ? 'C' : 'F'}`;
        
        const tempPercent = Math.max(0, Math.min(100, (data.temp / 85) * 100));
        document.getElementById('sys-temp-bar').style.width = `${tempPercent}%`;
        
        document.getElementById('sys-mem').innerText = `${data.memory}%`;
        document.getElementById('sys-mem-bar').style.width = `${data.memory}%`;
        
        document.getElementById('sys-disk').innerText = `${data.disk}%`;
        document.getElementById('sys-disk-bar').style.width = `${data.disk}%`;
        
        document.getElementById('sys-uptime').innerText = data.uptime;
    } catch(e) {}
}

function populateConfigForm() {
    const container = document.getElementById('config-form-container');
    if (!configData || Object.keys(configData).length === 0) {
        container.innerHTML = '<p class="text-red-400">Failed to load birdnet.conf</p>';
        return;
    }
    
    let html = '';
    const keyFields = ['CONFIDENCE', 'SENSITIVITY', 'OVERLAP', 'PRIVACY_THRESHOLD'];
    
    keyFields.forEach(k => {
        const val = configData[k] || '';
        html += `
        <div>
            <label class="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">${k.replace(/_/g, ' ')}</label>
            <input type="text" id="conf-${k}" value="${val}" class="w-full bg-[var(--bn-bg)] text-white border border-[var(--bn-border)] rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-[var(--bn-highlight)]">
        </div>
        `;
    });
    container.innerHTML = html;

    const generalFields = ['SITE_NAME', 'LATITUDE', 'LONGITUDE', 'TIMEZONE', 'BIRDWEATHER_ID', 'DATABASE_LANG', 'CADDY_PWD', 'BIRDNETPI_URL'];
    generalFields.forEach(key => {
        const el = document.getElementById(`config-${key}`);
        if (el && configData[key]) {
            el.value = configData[key];
        }
    });

    if (configData.FULL_DISK) {
        const radio = document.getElementById(`config-FULL_DISK-${configData.FULL_DISK}`);
        if (radio) radio.checked = true;
    }
    const purgeThreshold = document.getElementById('config-PURGE_THRESHOLD');
    if (purgeThreshold && configData.PURGE_THRESHOLD) purgeThreshold.value = configData.PURGE_THRESHOLD;
    
    const maxFiles = document.getElementById('config-MAX_FILES_SPECIES');
    if (maxFiles && configData.MAX_FILES_SPECIES) maxFiles.value = configData.MAX_FILES_SPECIES;

    const audioFields = ['REC_CARD', 'CHANNELS', 'RECORDING_LENGTH', 'EXTRACTION_LENGTH', 'HIGHPASS_FREQ', 'AUDIOFMT'];
    audioFields.forEach(key => {
        const el = document.getElementById(`config-${key}`);
        if (el && configData[key]) {
            el.value = configData[key];
        }
    });

    const analysisFields = ['MODEL', 'SF_THRESH', 'RARE_SPECIES_THRESHOLD', 'RAW_SPECTROGRAM'];
    analysisFields.forEach(key => {
        const el = document.getElementById(`config-${key}`);
        if (el && configData[key]) {
            el.value = configData[key];
        }
    });

    const notificationFields = [
        'APPRISE_SERVICES', 'APPRISE_NOTIFICATION_TITLE', 'APPRISE_NOTIFICATION_BODY', 'APPRISE_MINIMUM_SECONDS_BETWEEN_NOTIFICATIONS_PER_SPECIES',
        'APPRISE_ONLY_NOTIFY_SPECIES_NAMES', 'APPRISE_ONLY_NOTIFY_SPECIES_NAMES_2'
    ];
    notificationFields.forEach(key => {
        const el = document.getElementById(`config-${key}`);
        if (el && configData[key]) el.value = configData[key];
    });
    const notificationCheckboxes = [
        'APPRISE_NOTIFY_EACH_DETECTION', 'APPRISE_NOTIFY_NEW_SPECIES', 
        'APPRISE_NOTIFY_NEW_SPECIES_EACH_DAY', 'APPRISE_WEEKLY_REPORT'
    ];
    notificationCheckboxes.forEach(key => {
        const el = document.getElementById(`config-${key}`);
        if (el && configData[key] === 'true') el.checked = true;
    });
}

document.getElementById('btn-save-config').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-config');
    const status = document.getElementById('config-save-status');
    btn.disabled = true;
    btn.innerText = 'Saving...';
    
    const updates = {};
    const keyFields = [
        'CONFIDENCE', 'SENSITIVITY', 'OVERLAP', 'PRIVACY_THRESHOLD',
        'PURGE_THRESHOLD', 'MAX_FILES_SPECIES',
        'REC_CARD', 'CHANNELS', 'RECORDING_LENGTH', 'EXTRACTION_LENGTH', 'HIGHPASS_FREQ', 'AUDIOFMT',
        'MODEL', 'SF_THRESH', 'RARE_SPECIES_THRESHOLD', 'RAW_SPECTROGRAM',
        'APPRISE_SERVICES', 'APPRISE_NOTIFICATION_TITLE', 'APPRISE_NOTIFICATION_BODY', 'APPRISE_MINIMUM_SECONDS_BETWEEN_NOTIFICATIONS_PER_SPECIES',
        'APPRISE_ONLY_NOTIFY_SPECIES_NAMES', 'APPRISE_ONLY_NOTIFY_SPECIES_NAMES_2',
        'SITE_NAME', 'LATITUDE', 'LONGITUDE', 'TIMEZONE', 'BIRDWEATHER_ID', 'DATABASE_LANG', 'CADDY_PWD', 'BIRDNETPI_URL'
    ];
    keyFields.forEach(k => {
        const inputId = k.startsWith('config-') ? k : `conf-${k}`;
        const el = document.getElementById(inputId) || document.getElementById(`config-${k}`);
        if(el) updates[k] = el.value;
    });

    const checkboxes = [
        'APPRISE_NOTIFY_EACH_DETECTION', 'APPRISE_NOTIFY_NEW_SPECIES', 
        'APPRISE_NOTIFY_NEW_SPECIES_EACH_DAY', 'APPRISE_WEEKLY_REPORT'
    ];
    checkboxes.forEach(key => {
        const el = document.getElementById(`config-${key}`);
        if(el) updates[key] = el.checked ? 'true' : 'false';
    });

    const fullDiskRadio = document.querySelector('input[name="FULL_DISK"]:checked');
    if (fullDiskRadio) updates['FULL_DISK'] = fullDiskRadio.value;

    try {
        const res = await fetch(API_BASE + '/api/config/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(updates)
        });
        
        const result = await res.json();
        if (res.ok && result.success) {
            status.innerText = "Configuration saved successfully. Some changes may require a service restart to apply.";
            status.className = "mt-2 text-sm text-green-400 font-bold";
            configData = { ...configData, ...updates }; 
        } else {
            throw new Error(result.message || 'Save failed');
        }
    } catch (e) {
        status.innerText = "Error saving configuration: " + e.message;
        status.className = "mt-2 text-sm text-red-400 font-bold";
    } finally {
        status.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = 'Save Configuration';
        setTimeout(() => status.classList.add('hidden'), 5000);
    }
});

document.getElementById('btn-test-notification').addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-notification');
    const status = document.getElementById('test-notification-status');
    btn.disabled = true;
    btn.innerText = 'Sending...';
    status.classList.add('hidden');

    const apprise_services = document.getElementById('config-APPRISE_SERVICES').value;
    const title = document.getElementById('config-APPRISE_NOTIFICATION_TITLE').value;
    const body = document.getElementById('config-APPRISE_NOTIFICATION_BODY').value;

    try {
        const res = await fetch(API_BASE + '/api/config/test_notification', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ apprise_services, title, body })
        });
        const result = await res.json();
        if (res.ok && result.success) {
            status.innerText = "Test sent successfully!";
            status.className = "text-xs text-green-400 font-bold ml-2";
        } else {
            throw new Error(result.message || 'Send failed');
        }
    } catch (e) {
        status.innerText = "Error: " + e.message;
        status.className = "text-xs text-red-400 font-bold ml-2";
    } finally {
        status.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = 'Send Test Notification';
        setTimeout(() => status.classList.add('hidden'), 5000);
    }
});

let currentSpeciesList = '';
async function loadSpeciesList(listName) {
    document.querySelectorAll('.species-list-btn').forEach(b => {
        b.classList.remove('border-[var(--bn-highlight)]', 'text-[var(--bn-highlight)]');
        b.classList.add('border-[var(--bn-border)]', 'text-white');
    });
    const btn = document.getElementById(`btn-list-${listName}`);
    btn.classList.add('border-[var(--bn-highlight)]', 'text-[var(--bn-highlight)]');
    btn.classList.remove('border-[var(--bn-border)]', 'text-white');

    const textarea = document.getElementById('species-list-textarea');
    textarea.value = 'Loading...';
    currentSpeciesList = listName;
    
    try {
        const res = await fetch(API_BASE + `/api/species_list?list=${listName}`);
        const data = await res.json();
        textarea.value = data.content;
    } catch (e) {
        textarea.value = 'Error loading list.';
    }
}

document.getElementById('btn-save-species-list').addEventListener('click', async () => {
    if (!currentSpeciesList) {
        alert('Please select a list first.');
        return;
    }
    
    const btn = document.getElementById('btn-save-species-list');
    const status = document.getElementById('species-list-status');
    const textarea = document.getElementById('species-list-textarea');
    
    btn.disabled = true;
    btn.innerText = 'Saving...';
    
    try {
        const res = await fetch(API_BASE + '/api/species_list/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ list_name: currentSpeciesList, content: textarea.value })
        });

        if (res.ok) {
            status.innerText = `Successfully saved ${currentSpeciesList} list.`;
            status.className = "mt-2 text-sm text-green-400 font-bold";
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        status.innerText = "Error saving list.";
        status.className = "mt-2 text-sm text-red-400 font-bold";
    } finally {
        status.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = 'Save Current List';
        setTimeout(() => status.classList.add('hidden'), 4000);
    }
});

async function controlService(service, action) {
    const friendlyAction = action.charAt(0).toUpperCase() + action.slice(1);
    if (!confirm(`Are you sure you want to ${friendlyAction} ${service}?`)) return;

    try {
        const res = await fetch(API_BASE + '/api/service_control', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ action: action, service: service })
        });
        if(res.ok) {
            alert(`Request to ${friendlyAction} ${service} sent.`);
            setTimeout(loadServiceStatus, 2000); // Give time for service to change state
        } else {
            alert(`Failed to send command for ${service}.`);
        }
    } catch(e) {
        alert("Error connecting to backend.");
    }
}

async function loadServiceStatus() {
    const tbody = document.getElementById('services-table-body');
    try {
        const res = await fetch(API_BASE + '/api/services/status');
        const data = await res.json();

        if (data.detail) {
            throw new Error(data.detail);
        }
        
        tbody.innerHTML = '';
        for (const service in data) {
            const status = data[service];

            if (typeof status !== 'object' || status === null) continue;
            
            const activeBadge = ('active' in status && status.active === 'active')
                ? `<span class="px-2 py-1 text-xs font-bold rounded bg-green-900 text-green-400">ACTIVE</span>`
                : `<span class="px-2 py-1 text-xs font-bold rounded bg-slate-700 text-slate-300">INACTIVE</span>`;
            
            const enabledBadge = ('enabled' in status && status.enabled === 'enabled')
                ? `<span class="px-2 py-1 text-xs font-bold rounded bg-blue-900 text-blue-300">ENABLED</span>`
                : `<span class="px-2 py-1 text-xs font-bold rounded bg-red-900 text-red-400">DISABLED</span>`;

            let row = `
                <tr class="hover:bg-[var(--bn-bg)] transition-colors">
                    <td class="p-4 font-bold text-white font-mono text-xs">${service}</td>
                    <td class="p-4"><div class="flex gap-2">${activeBadge}${enabledBadge}</div></td>
                    <td class="p-4 text-right">
                        <div class="flex gap-2 justify-end">
                            <button onclick="controlService('${service}', 'stop')" class="bg-red-800 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors">Stop</button>
                            <button onclick="controlService('${service}', 'restart')" class="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors">Restart</button>
                            <button onclick="controlService('${service}', 'enable')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors">Enable</button>
                            <button onclick="controlService('${service}', 'disable')" class="bg-slate-600 hover:bg-slate-500 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors">Disable</button>
                        </div>
                    </td>
                </tr>
            `;
            tbody.innerHTML += row;
        }
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-red-400">Failed to load service statuses. ${e.message || ''}</td></tr>`;
    }
}

async function pollLog() {
    if(!document.getElementById('tab-log').classList.contains('active')) return;
    try {
        const res = await fetch(API_BASE + '/api/log');
        const text = await res.text();
        const out = document.getElementById('log-output');

        const formattedText = text.replace(/\\n/g, '\n');

        if(out.textContent !== formattedText) {
            out.textContent = formattedText;
            out.scrollTop = out.scrollHeight;
        }
    } catch(e) {}
}

// --- FILE MANAGER ---
async function loadFileManager(path = '') {
    const tbody = document.getElementById('file-manager-body');
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Loading files...</td></tr>`;

    try {
        const res = await fetch(API_BASE + `/api/files/list?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        
        // Breadcrumbs
        const breadcrumbs = document.getElementById('file-manager-breadcrumbs');
        let bcHtml = `<a href="#" onclick="loadFileManager('')" class="hover:underline">root</a> / `;
        let currentPath = '';
        if (data.current_path) {
            const parts = data.current_path.split('/');
            parts.forEach((part, i) => {
                if(!part) return;
                currentPath += (currentPath ? '/' : '') + part;
                if (i < parts.length - 1) {
                    bcHtml += `<a href="#" onclick="loadFileManager('${currentPath}')" class="hover:underline">${part}</a> / `;
                } else {
                    bcHtml += `${part}`;
                }
            });
        }
        breadcrumbs.innerHTML = bcHtml;

        // File table
        tbody.innerHTML = '';
        if (data.items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Directory is empty.</td></tr>`;
            return;
        }

        data.items.forEach(item => {
            const icon = item.is_dir 
                ? `<svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>`
                : `<svg class="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h2a2 2 0 002-2V4a2 2 0 00-2-2H9z"></path></svg>`;
            
            const nameCell = item.is_dir
                ? `<a href="#" onclick="loadFileManager('${item.rel_path}')" class="font-bold text-white hover:underline">${item.name}</a>`
                : `<span class="text-slate-200">${item.name}</span>`;

            const row = `
                <tr class="hover:bg-[var(--bn-bg)] transition-colors">
                    <td class="p-3 flex items-center gap-2">${icon}${nameCell}</td>
                    <td class="p-3 text-slate-400 font-mono">${item.is_dir ? '--' : formatFileSize(item.size)}</td>
                    <td class="p-3 text-slate-400 font-mono text-xs">${new Date(item.mtime * 1000).toLocaleString()}</td>
                    <td class="p-3 text-right">
                        <div class="flex gap-2 justify-end">
                            <a href="${API_BASE}/api/files/download?path=${encodeURIComponent(item.rel_path)}" download class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors">Download</a>
                            <button onclick="deleteFile('${item.rel_path}', '${item.name}')" class="bg-red-800 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-md text-xs transition-colors">Delete</button>
                        </div>
                    </td>
                </tr>`;
            tbody.innerHTML += row;
        });

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-400">Error loading files.</td></tr>`;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function deleteFile(path, name) {
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;

    try {
        const res = await fetch(`${API_BASE}/api/files/delete?path=${encodeURIComponent(path)}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            // Refresh the current directory view
            const currentPath = document.getElementById('file-manager-breadcrumbs').innerText.replace(/root \/ /g, '').replace(/ \/ /g, '/');
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            loadFileManager(parentPath);
        } else {
            const error = await res.json();
            alert(`Failed to delete file: ${error.detail}`);
        }
    } catch (e) {
        alert('An error occurred while trying to delete the file.');
    }
}

document.addEventListener('DOMContentLoaded', init);

// -------------------------------------------------------------
// SECOND SCRIPT BLOCK - COLLAGE LOGIC
// -------------------------------------------------------------
(function() {
    const SKETCH_VERSION = 'v1';
    const collageTab = document.getElementById('tab-collage');
    const navItem = document.querySelector('.nav-item[data-tab="collage"]');
    let collageInitialized = false;

    if (navItem) {
        navItem.addEventListener('click', () => {
            if (!collageInitialized) {
                setTimeout(() => {
                    initCollage();
                    collageInitialized = true;
                }, 50);
            }
        });
    }
    
    async function fetchJson(url) {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: Failed to load ${url}`);
        }
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            throw new Error(`Invalid JSON returned from ${url}`);
        }
    }

    async function initCollage() {
        console.log("[Collage] Initializing...");
        const container = document.getElementById('collage-container');
        if (container) {
            container.innerHTML = '<p class="text-center text-slate-300">Loading collage data...</p>';
        }

        const days = document.getElementById('global-date-filter').value;
        const cacheBuster = Date.now();
        
        try {
            const [dims, masks, data] = await Promise.all([
                fetchJson(`${API_BASE}/static/dims.json?v=${cacheBuster}`),
                fetchJson(`${API_BASE}/static/masks.json?v=${cacheBuster}`),
                fetchJson(`${API_BASE}/api/detections/collage-stats?days=${days}`)
            ]);
            
            console.log("[Collage] Fetched Data:", { dims, masks, data });
            
            const speciesData = data.species || [];
            if(speciesData.length === 0) {
                if (container) {
                    container.innerHTML = '<p class="text-center text-slate-400">No detections found for this timeframe.</p>';
                }
                console.log("[Collage] No species data to render.");
                return;
            }

            console.log("[Collage] Starting render process...");
            renderCollage({
                dims: dims,
                masks: masks,
                species: speciesData
            });

        } catch (error) {
            console.error('Failed to initialize collage (detailed error):', error);
            if (container) {
                container.innerHTML = `<p class="text-center text-red-400">Failed to load collage data. Please try again later.</p>`;
            }
        }
    }

    function getBirdImageUrl(speciesObj, pose = 1) {
        let sciName = '';
        let comName = '';
        
        if (typeof speciesObj === 'string') {
            sciName = speciesObj;
        } else if (speciesObj && typeof speciesObj === 'object') {
            sciName = speciesObj.sci || speciesObj.Sci_Name || '';
            comName = speciesObj.com || speciesObj.Com_Name || '';
        }
        
        sciName = sciName ? String(sciName).trim() : '';
        comName = comName ? String(comName).trim() : '';
        
        if (!sciName && !comName) {
            return null;
        }
        
        if (!sciName) {
            return null;
        }
        
        const formattedSci = sciName.toLowerCase().replace(/\s+/g, '-');
        const poseSuffix = (pose && parseInt(pose) > 1) ? `-${pose}` : '';
        return `${API_BASE}/static/bird_art/${formattedSci}${poseSuffix}.png`;
    }

    async function fetchWikipediaImage(species) {
        if (!species) return null;
        try {
            const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(species)}&prop=pageimages&format=json&pithumbsize=500&redirects=1&origin=*`;
            const res = await fetch(url);
            const data = await res.json();
            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];
            if (pageId !== "-1" && pages[pageId].thumbnail) {
                return pages[pageId].thumbnail.source;
            }
        } catch (e) {
            console.error("Failed to fetch Wikipedia image", e);
        }
        return null;
    }

    function renderCollage(data) {
        console.log("[Collage] renderCollage called with:", data);

        const container = document.getElementById('collage-container') || document.getElementById('tab-collage');
        const targetWidth = container.clientWidth > 50 ? container.clientWidth : 1200;
        const targetHeight = container.clientHeight > 50 ? container.clientHeight : 800;

        container.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.cssText = 'display: block; width: 100%; height: 100%; max-height: 85vh; object-fit: contain; background-color: #204b2e; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border-radius: 8px;';
        container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        var items = (data.species || [])
            .map(function(d) {
                return {
                    sci: d.sci || d.Sci_Name,
                    com: d.com || d.Com_Name,
                    n: +d.n || +d.count || 0,
                    last_seen: d.last_seen
                };
            })
            .sort(function(a, b) {
                return new Date(b.last_seen) - new Date(a.last_seen);
            });

        console.log("[Collage] Normalized and sorted items:", items);

        var dims = data.dims || {};
        var masks = data.masks || {};

        const aspect = targetWidth / targetHeight;
        console.log(`[Collage] Using dimensions: ${targetWidth}x${targetHeight}. Aspect: ${aspect}.`);
        
        var dpr = window.devicePixelRatio || 1;
        canvas.width = targetWidth * dpr;
        canvas.height = targetHeight * dpr;
        ctx.scale(dpr, dpr);

        console.log(`[Collage] Canvas created. Dimensions: ${canvas.width}x${canvas.height}. Aspect: ${aspect}.`);

        console.log("[Collage] Calculating layout with maskPack...");
        var layout = maskPack(items, aspect, masks, dims);
        console.log("[Collage] Layout calculated:", layout);

        if (!layout || layout.length === 0) {
            console.warn("[Collage] Layout calculation returned no items. Aborting render.");
            return;
        }

        var promises = layout.map(d => {
            return new Promise((resolve) => {
                let artUrl = getBirdImageUrl(d, d.item ? d.item.pose : 1);
                if (!artUrl) return resolve(null); 

                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => resolve({ ...d, img: img });
                img.onerror = () => {
                    console.warn('Local art missing, skipping collage drawing for:', d.sci);
                    resolve(d); 
                };
                img.src = artUrl;
            });
        });

        Promise.all(promises).then(function(loadedLayout) {
            console.log("[Collage] All image promises resolved. Painting canvas.");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const finalWidth = targetWidth;
            const finalHeight = targetHeight;

            loadedLayout.forEach(function(d, i) {
                if (d) {
                    const x = (d.x / 100) * finalWidth;
                    const y = (d.y / 100) * finalHeight;
                    const w = (d.w / 100) * finalWidth;
                    const h = (d.h / 100) * finalHeight;

                    if (d.img) {
                        try {
                            ctx.drawImage(d.img, x, y, w, h);
                        } catch (e) {
                            console.error('Draw failed for', d.sci, e);
                        }
                    } else {
                        ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
                        ctx.fillRect(x, y, w, h);
                    }
                }
            });
            console.log("[Collage] Canvas painting complete.");
        });
    }
    
    function tuning(n) {
      if (n <= 1) return { s: 0.9, w: 1, p: 2, c: 1, r: 1 };
      if (n <= 4) return { s: 0.75, w: 1, p: 1, c: 2, r: 2 };
      if (n <= 9) return { s: 0.48, w: 1, c: 3, r: 3 };
      if (n <= 12) return { s: 0.42, w: 1, c: 4, r: 3 };
      if (n <= 16) return { s: 0.35, w: 1, c: 4, r: 4 };
      if (n <= 25) return { s: 0.28, w: 1, c: 5, r: 5 };
      return { s: 0.24, w: 1, c: 6, r: 6 };
    }

    function maskPack(items, aspect, masks, dims) {
        if (!items || !items.length) return [];
        var n = items.length;
        var t = tuning(n);
        var gridW = t.c || 1;
        var gridH = Math.ceil(n / gridW);

        const cellH = Math.min(1 / (gridW * aspect), 1 / gridH);
        const cellW = cellH * aspect;

        var layout = [];
        var maskKeys = Object.keys(masks);

        for (var i = 0; i < n; i++) {
            try {
                var item = items[i];
                var maskName = maskKeys[i % maskKeys.length]; 
                var maskData = masks[maskName];
                
                var dimData = (dims && dims.images && dims.images[maskName]) ? dims.images[maskName] : { w: 500, h: 500 };

                if (!maskData) {
                    console.warn(`[Collage] Mask '${maskName}' not found for item`, item);
                    continue;
                }

                var maskAspect = dimData.w / dimData.h;
                var w, h, x, y, pose = 1;

                if (maskAspect > cellW / cellH) {
                    w = cellW;
                    h = w / maskAspect;
                } else {
                    h = cellH;
                    w = h * maskAspect;
                }
                
                var col = i % gridW;
                var row = Math.floor(i / gridW);

                x = (col * cellW) + (Math.random() * (cellW - w));
                y = (row * cellH) + (Math.random() * (cellH - h));

                var poses = maskData.poses || [1];
                pose = poses[Math.floor(Math.random() * poses.length)];

                layout.push({
                    x: x * 100, y: y * 100,
                    w: w * 100, h: h * 100,
                    sci: item.sci,
                    item: { ...item, mask: maskName, pose: pose }
                });
            } catch (e) {
                console.error("[Collage] Error processing item in maskPack:", items[i], e);
            }
        }
        return layout;
    }
})();

// --- EXPOSE HANDLERS TO GLOBAL SCOPE ---
window.switchAnalytics = switchAnalytics;
window.switchGallery = switchGallery;
window.switchTools = switchTools;
window.searchAndPlay = searchAndPlay;
window.openDetectionModal = openDetectionModal;
window.closeModal = closeModal;
window.openLightbox = openLightbox;
window.searchDatabase = searchDatabase;
window.filterDatabase = filterDatabase;
window.exportDatabaseCSV = exportDatabaseCSV;
window.triggerCompile = triggerCompile;
window.loadSpeciesList = loadSpeciesList;
window.controlService = controlService;
window.serviceControl = controlService;
window.loadFileManager = loadFileManager;
window.deleteFile = deleteFile;