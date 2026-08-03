// /static/js/tabs/collage.js

import * as api from '../api.js';

// This is a self-contained module for the live collage feature.
// It's a direct port of the original IIFE.

let interval;
let isRunning = false;
let maskPack;

async function fetchMasks() {
    try {
        const res = await fetch('/static/masks.json');
        maskPack = await res.json();
    } catch (e) {
        console.error("[Collage] Failed to load masks.json", e);
    }
}

function getLayout(count) {
    if (!maskPack) return [];
    const items = maskPack[count];
    if (!items) return [];
    
    let layout = [];
    for (let i = 0; i < items.length; i++) {
        try {
            const [x, y, w, h] = items[i].split(',').map(s => parseInt(s));
            const pose = `grid-area: ${y} / ${x} / span ${h} / span ${w};`;
            layout.push({ pose });
        } catch (e) {
            console.error("[Collage] Error processing item in maskPack:", items[i], e);
        }
    }
    return layout;
}

async function updateCollage() {
    if (!isRunning) return;
    try {
        const data = await api.fetchStats('1'); // Get stats for the last day
        const species = data.species_list_today || [];
        const container = document.getElementById('collage-container');
        if (species.length === 0) {
            container.innerHTML = '<p class="text-white text-2xl">No detections for collage yet...</p>';
            return;
        }
        
        const layout = getLayout(species.length);
        if (layout.length === 0) {
            container.innerHTML = '<p class="text-white text-2xl">No layout for this number of species...</p>';
            return;
        }

        container.innerHTML = '';
        container.style.gridTemplateColumns = 'repeat(12, 1fr)';
        container.style.gridTemplateRows = 'repeat(12, 1fr)';
        
        for (let i = 0; i < species.length; i++) {
            const s = species[i];
            const imgData = await api.fetchBirdImage(s.sci_name);
            let imgUrl = '/static/nest.webp'; // Default
            if (imgData && imgData.query.pages) {
                const pageId = Object.keys(imgData.query.pages)[0];
                if (pageId !== "-1" && imgData.query.pages[pageId].thumbnail) {
                    imgUrl = imgData.query.pages[pageId].thumbnail.source;
                }
            }
            container.innerHTML += `
                <div style="${layout[i].pose}" class="collage-cell">
                    <img src="${imgUrl}" class="collage-img">
                    <div class="collage-label">${s.com_name}</div>
                </div>
            `;
        }
    } catch (e) {
        console.error('[Collage] Failed to update collage', e);
    }
}


export function startCollage() {
    if (isRunning) return;
    isRunning = true;
    if (!maskPack) fetchMasks();
    updateCollage();
    interval = setInterval(updateCollage, 60000); // Update every minute
}

export function stopCollage() {
    if (!isRunning) return;
    isRunning = false;
    if (interval) clearInterval(interval);
}
