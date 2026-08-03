// /static/js/api.js

import { API_BASE } from './state.js';

/**
 * A wrapper around fetch to handle common error scenarios.
 * @param {string} url - The URL to fetch.
 * @param {object} options - The options for the fetch call.
 * @returns {Promise<any>} - The JSON response.
 */
async function apiFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            const error = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(error.detail || 'An unknown API error occurred.');
        }
        if (res.headers.get('Content-Type')?.includes('application/json')) {
            return res.json();
        }
        return res.text();

    } catch (error) {
        console.error(`API call to ${url} failed:`, error);
        throw error; // Re-throw to be handled by the caller
    }
}

export const fetchInitialData = () => apiFetch(`${API_BASE}/api/detections`);
export const fetchConfig = () => apiFetch(`${API_BASE}/api/config`);
export const fetchStats = (days = 'all') => apiFetch(`${API_BASE}/api/stats?days=${days}`);
export const fetchSystemStats = () => apiFetch(`${API_BASE}/api/system`);
export const fetchLog = () => apiFetch(`${API_BASE}/api/log`);
export const fetchGallery = () => apiFetch(`${API_BASE}/api/gallery`);
export const fetchSpeciesHistory = (species, days = '30') => apiFetch(`${API_BASE}/api/stats?days=${days}&species_of_interest=${encodeURIComponent(species)}`);
export const fetchFiles = (path = '') => apiFetch(`${API_BASE}/api/files/list?path=${encodeURIComponent(path)}`);
export const fetchSpeciesList = (listName) => apiFetch(`${API_BASE}/api/species_list?list=${listName}`);
export const fetchServiceStatus = () => apiFetch(`${API_BASE}/api/services/status`);
export const fetchPaginatedDetections = (params) => apiFetch(`${API_BASE}/api/detections?${params.toString()}`);

export const fetchWeatherData = (lat, lon, startDate, endDate, tempUnit, windUnit, precipUnit) => {
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max&timezone=auto&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&precipitation_unit=${precipUnit}`;
    return apiFetch(url);
};

export const fetchBirdImage = (species) => {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(species)}&prop=pageimages&format=json&pithumbsize=800&redirects=1&origin=*`;
    return apiFetch(url);
};

export const saveConfig = (updates) => apiFetch(`${API_BASE}/api/config/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
});

export const testNotification = (apprise_services, title, body) => apiFetch(`${API_BASE}/api/config/test_notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apprise_services, title, body })
});

export const saveSpeciesList = (listName, content) => apiFetch(`${API_BASE}/api/species_list/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list_name: listName, content: content })
});

export const controlService = (service, action) => apiFetch(`${API_BASE}/api/service_control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, service: service })
});

export const systemControl = (action) => apiFetch(`${API_BASE}/api/system_control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
});

export const compileAudio = (payload) => apiFetch(`${API_BASE}/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});

export const deleteFile = (path) => apiFetch(`${API_BASE}/api/files/delete?path=${encodeURIComponent(path)}`, {
    method: 'DELETE'
});
