// /static/js/tabs/database.js

import * as state from '../state.js';
import * as api from '../api.js';
import { openDetectionModal } from '../ui.js';

let observer;

function renderDatabaseTable(data, append = false) {
    const tbody = document.getElementById('db-table-body');
    if (!append) tbody.innerHTML = '';

    if (data.length === 0 && !append) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">No results found.</td></tr>';
        return;
    }

    data.forEach(d => {
        const conf = (parseFloat(d.Confidence) * 100).toFixed(1);
        tbody.innerHTML += `
            <tr class="cursor-pointer hover:bg-[var(--bn-bg)]" onclick="openDetectionModalWrapper('${d.path}', '${d.Com_Name}', '${d.Sci_Name}', '${conf}', '${d.path.split('/').pop()}')">
                <td class="p-3 text-slate-300">${d.Date}</td>
                <td class="p-3 text-slate-300">${d.Time}</td>
                <td class="p-3 text-white font-bold">${d.Com_Name}</td>
                <td class="p-3 text-slate-400 italic">${d.Sci_Name}</td>
                <td class="p-3 font-mono ${conf < 70 ? 'text-yellow-400' : 'text-[var(--bn-highlight)]'}">${conf}%</td>
                <td class="p-3 text-right">
                    <button class="w-8 h-8 rounded-full bg-[var(--bn-card)] text-[var(--bn-highlight)] flex items-center justify-center border border-[var(--bn-border)] group-hover:bg-[var(--bn-highlight)] group-hover:text-[#122617] transition-colors">
                        <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                    </button>
                </td>
            </tr>
        `;
    });
    document.getElementById('db-results-count').innerText = `${tbody.rows.length} of ${state.dbHasMore ? 'many' : tbody.rows.length} Results`;
}

async function fetchAndRenderDetections(params, append = false) {
    if (state.dbIsLoading) return;
    state.setDbIsLoading(true);
    if (!append) {
        state.setDbCurrentPage(0);
        state.setDbHasMore(true);
    }
    
    const loadingRow = document.createElement('tr');
    loadingRow.innerHTML = '<td colspan="6" class="p-4 text-center text-slate-400">Loading...</td>';
    if(append) document.getElementById('db-table-body').appendChild(loadingRow);

    params.set('page', state.dbCurrentPage);
    params.set('page_size', 50);

    try {
        const { detections, has_more } = await api.fetchPaginatedDetections(params);
        if (loadingRow.parentNode) loadingRow.remove();
        state.setDbHasMore(has_more);
        renderDatabaseTable(detections, append);
        state.setDbCurrentPage(state.dbCurrentPage + 1);
    } catch (e) {
        if (loadingRow.parentNode) loadingRow.remove();
        document.getElementById('db-table-body').innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-400">Error: ${e.message}</td></tr>`;
    } finally {
        state.setDbIsLoading(false);
    }
}

function filterDatabase() {
    const species = document.getElementById('db-filter-species').value;
    const startDate = document.getElementById('db-filter-date-start').value;
    const endDate = document.getElementById('db-filter-date-end').value;
    const startTime = document.getElementById('db-filter-time-start').value;
    const endTime = document.getElementById('db-filter-time-end').value;
    const minConf = document.getElementById('db-filter-conf').value;

    const params = new URLSearchParams();
    if (species) params.set('species', species);
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    if (startTime) params.set('start_time', startTime);
    if (endTime) params.set('end_time', endTime);
    if (minConf) params.set('min_confidence', minConf);
    
    state.setCurrentDbQuery(params);
    fetchAndRenderDetections(params, false);
}

function exportDatabaseCSV() {
    // This uses the main dbData from state, which might not match the paginated view
    // For a more robust solution, this should query the API with the current filters
    // and 'all' pages, or the backend should provide a dedicated export endpoint.
    let csvContent = "data:text/csv;charset=utf-8,Date,Time,Sci_Name,Com_Name,Confidence
";
    state.dbData.forEach(row => {
        csvContent += `${row.Date},${row.Time},"${row.Sci_Name}","${row.Com_Name}",${row.Confidence}
`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "birdnet_pi_detections.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function setupIntersectionObserver() {
    const opts = { root: document.querySelector('#tab-database'), rootMargin: '0px', threshold: 1.0 };
    observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !state.dbIsLoading && state.dbHasMore) {
            fetchAndRenderDetections(state.currentDbQuery, true);
        }
    }, opts);
    
    const target = document.createElement('div');
    target.id = "db-scroll-trigger";
    target.style.height = '1px';
    document.getElementById('tab-database').appendChild(target);
    observer.observe(target);
}

export function setupDatabaseTab() {
    window.openDetectionModalWrapper = openDetectionModal;
    window.filterDatabase = filterDatabase;
    window.exportDatabaseCSV = exportDatabaseCSV;
    
    // Initial load
    filterDatabase();
    
    setupIntersectionObserver();
    
    // Populate species datalist
    const uniqueSpecies = [...new Set(state.dbData.map(item => item.Com_Name))].sort();
    const datalist = document.getElementById('species-list-options');
    uniqueSpecies.forEach(s => datalist.innerHTML += `<option value="${s}"></option>`);
}
