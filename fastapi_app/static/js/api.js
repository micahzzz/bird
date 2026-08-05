// api.js
/**
 * A centralized module for all backend API communications.
 * This file has been updated to accurately reflect the FastAPI backend routes.
 */

const API_BASE_URL = window.location.origin;

/**
 * A generic fetch handler to reduce boilerplate.
 * @param {string} endpoint - The API endpoint to call (e.g., /api/detections).
 * @param {object} [options={}] - Optional fetch options (method, body, etc.).
 * @param {string} [responseType='json'] - The expected response type ('json', 'text', 'blob').
 * @returns {Promise<any>} - The parsed response data.
 */
async function fetchAPI(endpoint, options = {}, responseType = 'json') {
    const url = `${API_BASE_URL}${endpoint}`;
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API Error on ${endpoint}: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        if (responseType === 'json') return response.json();
        if (responseType === 'text') return response.text();
        if (responseType === 'blob') return response.blob();
        return response;
    } catch (error) {
        console.error(`Failed to fetch from endpoint: ${endpoint}`, error);
        throw error;
    }
}

// --- Detections & Stats ---

/**
 * Fetches paginated and filtered detections.
 * @param {object} params - Filter parameters.
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {string} [params.sp] - Common name for species.
 * @param {string} [params.dStart] - Start date (YYYY-MM-DD).
 * @param {string} [params.dEnd] - End date (YYYY-MM-DD).
 * @param {string} [params.tStart] - Start time (HH:MM:SS).
 * @param {string} [params.tEnd] - End time (HH:MM:SS).
 * @param {number} [params.minConf=0] - Minimum confidence.
 * @returns {Promise<{detections: object[], total_count: number}>}
 */
export const getDetections = (params) => {
    const query = new URLSearchParams(params).toString();
    return fetchAPI(`/api/detections?${query}`);
};

/**
 * Fetches aggregate statistics.
 * @param {object} params
 * @param {string} [params.days] - Timeframe (e.g., '7', '30', 'today').
 * @param {string} [params.species_of_interest] - Specific species to get daily counts for.
 * @returns {Promise<object>}
 */
export const getStats = (params) => {
    const query = new URLSearchParams(params).toString();
    return fetchAPI(`/api/detections/stats?${query}`);
};

/**
 * Fetches species stats for the collage view.
 * @param {string} [days='7'] - Timeframe.
 * @returns {Promise<{species: object[]}>}
 */
export const getCollageStats = (days = '7') => {
    return fetchAPI(`/api/detections/collage-stats?days=${days}`);
};

/**
 * Fetches detection counts for the last 24 hours, aggregated by hour.
 * @returns {Promise<object>}
 */
export const getHourlyStats = () => fetchAPI('/api/detections/stats/hourly');

// --- System & Configuration ---

/**
 * Fetches system telemetry data.
 * @returns {Promise<object>}
 */
export const getSystemInfo = () => fetchAPI('/api/system');

/**
 * Fetches the contents of the birdnet.conf file.
 * @returns {Promise<object>} - A JSON representation of the config.
 */
export const getConfig = () => fetchAPI('/api/system/config');

/**
 * Updates the birdnet.conf file.
 * @param {object} configData - The configuration object to save.
 * @returns {Promise<object>}
 */
export const updateConfig = (configData) => {
    return fetchAPI('/api/system/config/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData),
    });
};

/**
 * Sends a test notification.
 * @param {object} notificationData
 * @param {string} notificationData.apprise_services
 * @param {string} notificationData.title
 * @param {string} notificationData.body
 * @returns {Promise<object>}
 */
export const sendTestNotification = (notificationData) => {
    return fetchAPI('/api/system/config/test_notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notificationData),
    });
};

// --- Services & System Control ---

/**
 * Fetches the statuses of systemd services.
 * @returns {Promise<object>}
 */
export const getServiceStatus = () => fetchAPI('/api/system/services/status');

/**
 * Sends a command to a systemd service.
 * @param {string} service - The name of the service.
 * @param {string} action - 'start', 'stop', 'restart', 'enable', 'disable'.
 * @returns {Promise<object>}
 */
export const controlService = (service, action) => {
    return fetchAPI('/api/system/service_control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, action }),
    });
};

/**
 * Sends a system-level command.
 * @param {string} action - 'reboot' or 'shutdown'.
 * @returns {Promise<object>}
 */
export const controlSystem = (action) => {
    return fetchAPI('/api/system/system_control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
    });
};

// --- Media, Gallery & Compiler ---

/**
 * Fetches gallery data (recent and best recordings).
 * @returns {Promise<{recent: object[], best: object[]}>}
 */
export const getGalleryData = () => fetchAPI('/api/gallery');

/**
 * Requests an audio compilation.
 * @param {object} payload
 * @param {string} payload.species
 * @param {number} payload.min_conf
 * @param {number} payload.limit
 * @param {string} [payload.start_date]
 * @param {string} [payload.end_date]
 * @returns {Promise<object>}
 */
export const compileAudio = (payload) => {
    return fetchAPI('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
};

// --- Species Lists ---

/**
 * Fetches a specific species list.
 * @param {string} listName - 'confirmed', 'whitelisted', or 'excluded'.
 * @returns {Promise<{list: string, content: string}>}
 */
export const getSpeciesList = (listName) => {
    return fetchAPI(`/api/system/species_list?list=${listName}`);
};

/**
 * Updates a species list.
 * @param {string} list_name - 'confirmed', 'whitelisted', or 'excluded'.
 * @param {string} content - The list content.
 * @returns {Promise<object>}
 */
export const updateSpeciesList = (list_name, content) => {
    return fetchAPI('/api/system/species_list/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_name, content }),
    });
};

// --- File Manager ---

/**
 * Lists files and directories.
 * @param {string} path - The directory path to list relative to the BirdSongs root.
 * @returns {Promise<{current_path: string, items: object[]}>}
 */
export const listDirectory = (path = '') => {
    const params = new URLSearchParams({ path });
    return fetchAPI(`/api/system/files/list?${params}`);
};

/**
 * Deletes a file or directory.
 * @param {string} path - The path to the item to delete.
 * @returns {Promise<object>}
 */
export const deleteFile = (path) => {
    const params = new URLSearchParams({ path });
    return fetchAPI(`/api/system/files/delete?${params}`, { method: 'DELETE' });
};

// Note: File download is handled directly via an <a> tag's href,
// so it does not need a dedicated JS API function.
// e.g., <a href="/api/system/files/download?path=...">Download</a>
