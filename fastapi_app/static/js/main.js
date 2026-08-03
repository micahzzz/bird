// /static/js/main.js

import * as state from './state.js';
import * as api from './api.js';
import * as ui from './ui.js';
import { initDashboard, renderDashboard, updateDashboardStats } from './tabs/dashboard.js';
import { fetchAndRenderGallery, setupGalleryAndCompiler } from './tabs/gallery.js';
import { setupTools } from './tabs/tools.js';
import { setupDatabaseTab } from './tabs/database.js';
import { setupAnalyticsTab } from './tabs/analytics.js';
import { startLogPolling, stopLogPolling } from './tabs/log.js';
import { startCollage, stopCollage } from './tabs/collage.js';

function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.dataset.tab;
            
            // Deactivate previous
            document.querySelector('.nav-item.active').classList.remove('active');
            document.querySelector('.tab-content.active').classList.remove('active');
            
            // Activate new
            item.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');
            document.getElementById('current-tab-title').innerText = tabName;

            // Handle polling for specific tabs
            if (tabName === 'log') startLogPolling();
            else stopLogPolling();

            if (tabName === 'collage') startCollage();
            else stopCollage();

            // Resize charts if they exist in the new tab
            if (state.activeChart) state.activeChart.resize();
        });
    });
}

function setupGlobalEventListeners() {
    document.getElementById('global-date-filter').addEventListener('change', async (e) => {
        const days = e.target.value;
        const data = await api.fetchStats(days);
        state.setDbData(data.detections);
        renderDashboard(data.detections);
        updateDashboardStats(days);
    });

    document.querySelector('.sidebar').addEventListener('mouseenter', () => document.body.classList.add('sidebar-hover'));
    document.querySelector('.sidebar').addEventListener('mouseleave', () => document.body.classList.remove('sidebar-hover'));

    // Other global listeners can go here
}

async function init() {
    setupNav();
    ui.setupModalControls();
    setupGlobalEventListeners();

    try {
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.classList.remove('hidden');

        const [config, initialStats] = await Promise.all([
            api.fetchConfig(),
            api.fetchStats('30')
        ]);

        state.setConfigData(config);
        state.setDbData(initialStats.detections);
        
        // Setup all tabs
        initDashboard();
        renderDashboard(initialStats.detections);
        updateDashboardStats('30');
        
        setupDatabaseTab();
        setupAnalyticsTab();
        fetchAndRenderGallery(); // Also inits compiler
        setupGalleryAndCompiler();
        setupTools();

        loadingIndicator.classList.add('hidden');
    } catch (e) {
        document.getElementById('loading-indicator').innerText = "Error loading initial data.";
        console.error("Initialization failed:", e);
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
