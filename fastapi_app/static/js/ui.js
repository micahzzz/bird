// /static/js/ui.js

import * as state from './state.js';
import * as api from './api.js';

export function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "'").replace(/"/g, '&quot;');
}

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}


// --- MODAL & AUDIO ---

export function initWebAudioAPI() {
    if (state.isAudioSetup) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.setAudioCtx(new AudioContext());
    
    const modalAudioEl = document.getElementById('modal-audio');
    state.setTrackNode(state.audioCtx.createMediaElementSource(modalAudioEl));
    
    state.setHighpassNode(state.audioCtx.createBiquadFilter());
    state.highpassNode.type = 'highpass';
    state.highpassNode.frequency.value = 0;
    
    state.setLowpassNode(state.audioCtx.createBiquadFilter());
    state.lowpassNode.type = 'lowpass';
    state.lowpassNode.frequency.value = 24000;
    
    state.setGainNode(state.audioCtx.createGain());
    
    state.trackNode.connect(state.highpassNode);
    state.highpassNode.connect(state.lowpassNode);
    state.lowpassNode.connect(state.gainNode);
    state.gainNode.connect(state.audioCtx.destination);
    
    state.setIsAudioSetup(true);
}

export function openLightbox() {
    const imgSrc = document.getElementById('modal-bird-img').src;
    if (imgSrc && !imgSrc.endsWith('.html')) {
        document.getElementById('lightbox-img').src = imgSrc;
        document.getElementById('lightbox').classList.remove('hidden');
    }
}

export function toggleModalAudioPlayback() {
    document.getElementById('modal-play-btn').click();
}

async function drawModalHistoryChart(species, days = '30') {
    const ctx = document.getElementById('modal-history-chart').getContext('2d');
    
    try {
        const statsData = await api.fetchSpeciesHistory(species, days);
        const daily = statsData.species_by_date ? (statsData.species_by_date[species] || {}) : {};

        const labels = []; 
        const data = [];
        const daysToParse = (days === 'all') ? 365 : parseInt(days);

        let curr = new Date();
        curr.setDate(curr.getDate() - daysToParse);

        while (curr <= new Date()) {
            const dStr = curr.toISOString().split('T')[0];
            labels.push(`${curr.toLocaleString('default',{month:'short'})} ${curr.getDate()}`);
            data.push(daily[dStr] || 0);
            curr.setDate(curr.getDate() + 1);
        }
        
        state.setModalChart(new Chart(ctx, {
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
                    x: { ticks: { color: '#cbd5e1', autoSkip: true, maxTicksLimit: 6 } }, 
                    y: { display: false, min: 0 } 
                } 
            }
        }));
    } catch (e) {
        console.error("Failed to draw modal history chart", e);
    }
}

export async function openDetectionModal(url, species, sciName, conf, fname) {
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

    api.fetchBirdImage(sciName || species).then(imgUrl => {
        if(imgUrl) { 
            const pages = imgUrl.query.pages;
            const pageId = Object.keys(pages)[0];
            if (pageId !== "-1" && pages[pageId].thumbnail) {
                imgEl.src = pages[pageId].thumbnail.source;
                imgEl.classList.remove('hidden'); 
                placeholder.classList.add('hidden');
            }
        }
    });
    
    const cleanUrl = url.startsWith('/') ? url : '/' + url;
    document.getElementById('modal-audio').src = cleanUrl;
    document.getElementById('modal-download').href = cleanUrl;
    
    document.getElementById('modal-icon-play').classList.remove('hidden');
    document.getElementById('modal-icon-pause').classList.add('hidden');
    
    // Reset filters
    document.querySelectorAll('#gain-controls .filter-btn, #hp-controls .filter-btn, #lp-controls .filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#gain-controls .filter-btn[data-val="1"]').classList.add('active');
    document.querySelector('#hp-controls .filter-btn[data-val="0"]').classList.add('active');
    document.querySelector('#lp-controls .filter-btn[data-val="24000"]').classList.add('active');
    
    if (state.isAudioSetup) {
        state.gainNode.gain.value = 1;
        state.highpassNode.frequency.value = 0;
        state.lowpassNode.frequency.value = 24000;
    }

    const imgPath = cleanUrl.substring(0, cleanUrl.lastIndexOf('.')) + '.png';
    const specImg = document.getElementById('modal-spectro-img');
    specImg.src = imgPath;
    
    document.getElementById('history-popover').classList.add('hidden');
    drawModalHistoryChart(species, document.getElementById('history-timeframe').value);

    document.getElementById('modal-progress').style.width = '0%';
    document.getElementById('modal-playhead').style.left = '0%';
    document.getElementById('modal-time').innerText = '0:00';
    if(state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
}

export async function searchAndPlay(species, sciName, date, time, pct) {
    if(state.galleryCacheRecent.length === 0) await api.fetchGallery();
    const timeStr = time.replace(/:/g,'');
    const found = state.galleryCacheRecent.find(f => f.species === species && f.filename.includes(date) && f.filename.replace(/:/g,'').includes(timeStr.substring(0,4)));
    if(found) openDetectionModal(found.filepath, found.species, sciName, (found.confidence*100).toFixed(0), found.filename);
}

export function closeModal() {
    document.getElementById('detection-modal').classList.add('hidden');
    document.getElementById('history-popover').classList.add('hidden');
    document.getElementById('modal-audio').pause();
    if(state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
}

function updatePlayhead() {
    const modalAudioEl = document.getElementById('modal-audio');
    if (!modalAudioEl.paused && modalAudioEl.duration) {
        const pct = (modalAudioEl.currentTime / modalAudioEl.duration) * 100;
        document.getElementById('modal-progress').style.width = `${pct}%`;
        document.getElementById('modal-playhead').style.left = `${pct}%`;
        
        const mins = Math.floor(modalAudioEl.currentTime / 60);
        const secs = Math.floor(modalAudioEl.currentTime % 60);
        document.getElementById('modal-time').innerText = `${mins}:${String(secs).padStart(2,'0')}`;

        state.setAnimationFrameId(requestAnimationFrame(updatePlayhead));
    }
}

export function setupModalControls() {
    document.getElementById('modal-play-btn').addEventListener('click', () => {
        initWebAudioAPI(); 
        if (state.audioCtx && state.audioCtx.state === 'suspended') state.audioCtx.resume();
        
        const modalAudioEl = document.getElementById('modal-audio');
        if(modalAudioEl.paused) {
            modalAudioEl.play();
            document.getElementById('modal-icon-play').classList.add('hidden');
            document.getElementById('modal-icon-pause').classList.remove('hidden');
            state.setAnimationFrameId(requestAnimationFrame(updatePlayhead));
        } else {
            modalAudioEl.pause();
            document.getElementById('modal-icon-play').classList.remove('hidden');
            document.getElementById('modal-icon-pause').classList.add('hidden');
            if(state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
        }
    });

    document.getElementById('modal-progress-container').addEventListener('click', (e) => {
        const modalAudioEl = document.getElementById('modal-audio');
        if(modalAudioEl.duration) {
            const rect = e.currentTarget.getBoundingClientRect();
            modalAudioEl.currentTime = ((e.clientX - rect.left) / rect.width) * modalAudioEl.duration;
            updatePlayhead();
        }
    });
    
    document.getElementById('modal-audio').addEventListener('ended', () => {
        document.getElementById('modal-icon-play').classList.remove('hidden');
        document.getElementById('modal-icon-pause').classList.add('hidden');
        document.getElementById('modal-playhead').style.left = '0%';
        document.getElementById('modal-progress').style.width = '0%';
        if(state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    });

    // Audio filters
    document.querySelectorAll('#gain-controls .filter-btn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('#gain-controls .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (state.isAudioSetup) state.gainNode.gain.value = parseFloat(e.target.dataset.val);
    }));
    document.querySelectorAll('#hp-controls .filter-btn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('#hp-controls .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (state.isAudioSetup) state.highpassNode.frequency.value = parseFloat(e.target.dataset.val);
    }));
    document.querySelectorAll('#lp-controls .filter-btn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('#lp-controls .filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        if (state.isAudioSetup) state.lowpassNode.frequency.value = parseFloat(e.target.dataset.val);
    }));

    // Popovers and clicks
    document.getElementById('modal-stats-btn').addEventListener('click', () => {
        const popover = document.getElementById('history-popover');
        popover.classList.toggle('hidden');
        if (!popover.classList.contains('hidden') && state.modalChart) {
            state.modalChart.resize();
        }
    });

    document.getElementById('history-timeframe').addEventListener('change', (e) => {
        drawModalHistoryChart(document.getElementById('modal-title').innerText, e.target.value);
    });
    
    document.getElementById('modal-spectro-img').parentElement.onclick = toggleModalAudioPlayback;

}
