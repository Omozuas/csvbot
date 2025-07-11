const fs = require('fs');
const path = require('path');
const CACHE_PATH = path.join(__dirname, '../cache/gpt_cache.json');
let memoryCache = {}; // Keep in-memory copy for performance


// Load from disk once when server starts
function loadCache() {
if (!fs.existsSync(CACHE_PATH)) {
memoryCache = {};
return;
}

try {
const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
memoryCache = raw ? JSON.parse(raw) : {};
} catch (err) {
console.warn('⚠️ GPT cache load failed. Starting fresh.');
memoryCache = {};
}
}

// Save to disk
function saveCache() {
try {
fs.writeFileSync(CACHE_PATH, JSON.stringify(memoryCache, null, 2));
} catch (err) {
console.error('❌ Failed to save GPT cache:', err.message);
}
}

// Accessors
function getCachedLogic(query) {
return memoryCache[query] || null;
}

function setCachedLogic(query, logic) {
memoryCache[query] = logic;
saveCache();
}

// Load cache immediately at startup
loadCache();

module.exports = {
getCachedLogic,
setCachedLogic
};

