// /static/js/state.js

/**
 * This module holds the shared state for the application.
 * We export the state variables and setter functions to allow other modules to
 * access and update the state in a controlled manner.
 */

export const API_BASE = 'http://' + (window.location.hostname || 'localhost') + ':9999';

export let dbData = [];
export let configData = {};
export let activeChart = null;
export let isMetric = false;
export let galleryCacheRecent = [];
export let galleryCacheBest = [];
export let currentBestSort = 'name';
export let modalChart = null;

// Audio context-related state
export let audioCtx;
export let trackNode;
export let gainNode;
export let highpassNode;
export let lowpassNode;
export let isAudioSetup = false;
export let animationFrameId;

// Live spectrogram state
export let liveAudioCtx;
export let liveAnalyser;
export let liveSource;
export let liveDataArray;
export let isLiveAudioSetup = false;
export let liveAnimId;

// Database state
export let dbCurrentPage = 0;
export let dbIsLoading = false;
export let dbHasMore = true;
export let currentDbQuery = {};

// --- SETTERS ---

export function setDbData(data) { dbData = data; window.currentDbExport = data; }
export function setConfigData(data) { configData = data; }
export function setActiveChart(chart) { if (activeChart) { activeChart.destroy(); } activeChart = chart; }
export function setIsMetric(val) { isMetric = val; }
export function setGalleryCacheRecent(data) { galleryCacheRecent = data; }
export function setGalleryCacheBest(data) { galleryCacheBest = data; }
export function setCurrentBestSort(sort) { currentBestSort = sort; }
export function setModalChart(chart) { if (modalChart) { modalChart.destroy(); } modalChart = chart; }

export function setAudioCtx(ctx) { audioCtx = ctx; }
export function setTrackNode(node) { trackNode = node; }
export function setGainNode(node) { gainNode = node; }
export function setHighpassNode(node) { highpassNode = node; }
export function setLowpassNode(node) { lowpassNode = node; }
export function setIsAudioSetup(val) { isAudioSetup = val; }
export function setAnimationFrameId(id) { animationFrameId = id; }

export function setLiveAudioCtx(ctx) { liveAudioCtx = ctx; }
export function setLiveAnalyser(analyser) { liveAnalyser = analyser; }
export function setLiveSource(source) { liveSource = source; }
export function setLiveDataArray(dataArray) { liveDataArray = dataArray; }
export function setIsLiveAudioSetup(val) { isLiveAudioSetup = val; }
export function setLiveAnimId(id) { liveAnimId = id; }

export function setDbCurrentPage(page) { dbCurrentPage = page; }
export function setDbIsLoading(loading) { dbIsLoading = loading; }
export function setDbHasMore(more) { dbHasMore = more; }
export function setCurrentDbQuery(query) { currentDbQuery = query; }
