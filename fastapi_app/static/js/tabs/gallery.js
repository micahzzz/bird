// /static/js/tabs/gallery.js

import * as state from '../state.js';
import * as api from '../api.js';
import { openDetectionModal } from '../ui.js';

export async function fetchAndRenderGallery() {
    try {
        const data = await api.fetchGallery();
        state.setGalleryCacheRecent(data.recent);
        state.setGalleryCacheBest(data.best);
        renderRecent(data.recent);
        renderTodayList(data.today);
        renderBest(data.best);
        updateCompilerSuggestions();
    } catch(e) {
        document.getElementById('gallery-recent').innerHTML = '<p class="text-red-400">Failed to load gallery.</p>';
    }
}

function renderRecent(data) {
    const container = document.getElementById('gallery-recent');
    container.innerHTML = '';
    data.forEach(item => {
        const conf = (item.confidence * 100).toFixed(0);
        container.innerHTML += `
            <div onclick="openDetectionModalWrapper('${item.filepath}', '${item.species}', '${item.sci_name}', '${conf}', '${item.filename}')" class="bird-card p-4 flex gap-4 cursor-pointer hover:bg-[var(--bn-bg)] transition-colors group">
                <div class="w-16 h-16 shrink-0 rounded-lg bg-cover bg-center border border-[var(--bn-border)]" style="background-image: url('${item.spectrogram_path}')"></div>
                <div class="overflow-hidden">
                    <h4 class="text-white font-bold truncate">${item.species}</h4>
                    <p class="text-xs text-slate-400">${new Date(item.mtime * 1000).toLocaleString()}</p>
                    <span class="text-xs font-mono font-bold text-[var(--bn-highlight)]">${conf}%</span>
                </div>
            </div>
        `;
    });
}

function renderTodayList(data) {
    const container = document.getElementById('gallery-today-body');
    container.innerHTML = '';
    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-400">Nothing detected yet today.</td></tr>';
        return;
    }
    for (const species in data) {
        const item = data[species];
        container.innerHTML += `
            <tr class="cursor-pointer hover:bg-[var(--bn-bg)]" onclick="openDetectionModalWrapper('${item.filepath}', '${species}', '${item.sci_name}', '${(item.confidence*100).toFixed(0)}', '${item.filename}')">
                <td class="p-4 text-white font-bold">${species}</td>
                <td class="p-4 text-slate-300">${item.hits}</td>
                <td class="p-4 text-slate-300">${item.time}</td>
            </tr>
        `;
    }
}

function renderBest(data) {
    const container = document.getElementById('gallery-best-grid');
    container.innerHTML = '';
    data.forEach(item => {
        const conf = (item.confidence * 100).toFixed(0);
        container.innerHTML += `
            <div onclick="openDetectionModalWrapper('${item.filepath}', '${item.species}', '${item.sci_name}', '${conf}', '${item.filename}')" class="bird-card p-4 flex gap-4 cursor-pointer hover:bg-[var(--bn-bg)] transition-colors group">
                <div class="w-16 h-16 shrink-0 rounded-lg bg-cover bg-center border border-[var(--bn-border)]" style="background-image: url('${item.spectrogram_path}')"></div>
                <div class="overflow-hidden">
                    <h4 class="text-white font-bold truncate">${item.species}</h4>
                    <p class="text-xs text-slate-400">${new Date(item.mtime * 1000).toLocaleDateString()}</p>
                    <span class="text-xs font-mono font-bold text-yellow-400">${item.hits} hits</span>
                    <span class="text-xs font-mono font-bold text-[var(--bn-highlight)] ml-2">${conf}%</span>
                </div>
            </div>
        `;
    });
}

export function switchGallery(view, btn) {
    document.querySelectorAll('#tab-gallery .toggle-btn').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');

    ['recent', 'today', 'best'].forEach(v => {
        document.getElementById(`gallery-${v}`).style.display = (v === view) ? (v === 'today' ? 'block' : 'grid') : 'none';
    });
}

function sortBest(sortBy) {
    const sorted = [...state.galleryCacheBest];
    if (sortBy === 'name') sorted.sort((a,b) => a.species.localeCompare(b.species));
    else if (sortBy === 'hits') sorted.sort((a,b) => b.hits - a.hits);
    else if (sortBy === 'conf') sorted.sort((a,b) => b.confidence - a.confidence);
    else if (sortBy === 'date') sorted.sort((a,b) => b.mtime - a.mtime);
    state.setCurrentBestSort(sortBy);
    renderBest(sorted);
}

// --- COMPILER ---

export function updateCompilerSuggestions() {
    const suggestionsContainer = document.getElementById('compiler-suggestions');
    const speciesSelect = document.getElementById('compile-species');
    suggestionsContainer.innerHTML = '';
    speciesSelect.innerHTML = '<option value="">Select a species...</option>';

    const timeframe = document.getElementById('compiler-timeframe').value;
    const now = Date.now() / 1000;
    const cutoff = (timeframe === 'all') ? 0 : now - (parseInt(timeframe) * 86400);

    const filtered = state.galleryCacheRecent.filter(d => d.mtime > cutoff);

    const speciesCounts = filtered.reduce((acc, curr) => {
        acc[curr.species] = (acc[curr.species] || 0) + 1;
        return acc;
    }, {});
    
    const sortedSpecies = Object.keys(speciesCounts).sort((a,b) => speciesCounts[b] - speciesCounts[a]);

    // Populate dropdown
    sortedSpecies.forEach(s => speciesSelect.innerHTML += `<option value="${s}">${s}</option>`);

    // Top 3 suggestions
    sortedSpecies.slice(0,3).forEach(s => {
        const bestExample = state.galleryCacheBest.find(b => b.species === s);
        suggestionsContainer.innerHTML += `
            <div class="bird-card p-4 text-center cursor-pointer hover:bg-[var(--bn-bg)] transition-colors" onclick="triggerCompileWrapper('${s}')">
                <h4 class="text-white font-bold text-lg">${s}</h4>
                <p class="text-sm text-slate-300">${speciesCounts[s]} detections</p>
            </div>
        `;
    });
}

async function triggerCompile(species) {
    const conf = document.getElementById('compile-conf').value;
    const timeframe = document.getElementById('compiler-timeframe').value;
    const statusEl = document.getElementById('compile-status');

    let startDate = '1970-01-01';
    if(timeframe !== 'all') {
        const d = new Date();
        d.setDate(d.getDate() - parseInt(timeframe));
        startDate = d.toISOString().split('T')[0];
    }
    
    statusEl.innerText = `Compiling audio for ${species}...`;
    statusEl.classList.remove('hidden', 'text-red-400');
    statusEl.classList.add('text-yellow-400');

    try {
        const res = await api.compileAudio({ 
            species, 
            min_conf: conf, 
            limit: 50,
            start_date: startDate,
            end_date: new Date().toISOString().split('T')[0]
        });
        statusEl.innerText = res.message || 'Compilation successful.';
        statusEl.classList.replace('text-yellow-400', 'text-green-400');
    } catch (e) {
        statusEl.innerText = e.message || 'Compilation failed.';
        statusEl.classList.replace('text-yellow-400', 'text-red-400');
    }
}

export function setupGalleryAndCompiler() {
    // Make functions available on window for inline `onclick`
    window.openDetectionModalWrapper = openDetectionModal;
    window.switchGallery = switchGallery;
    window.triggerCompileWrapper = triggerCompile;

    document.querySelectorAll('#gallery-best .sort-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#gallery-best .sort-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            sortBest(e.target.dataset.sort);
        });
    });

    document.getElementById('compiler-timeframe').addEventListener('change', updateCompilerSuggestions);
    document.getElementById('compile-btn').addEventListener('click', () => {
        const species = document.getElementById('compile-species').value;
        if(species) triggerCompile(species);
    });
}
