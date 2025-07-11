const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../logs/query_logs.json');

function logQuery(nlQuery, results, filePath, sessionId = null) {
const log = {
timestamp: new Date().toISOString(),
sessionId,
query: nlQuery,
resultCount: results.length,
csvExportPath: filePath
};

let logs = [];

try {
if (fs.existsSync(LOG_PATH)) {
const raw = fs.readFileSync(LOG_PATH, 'utf-8');
const parsed = raw ? JSON.parse(raw) : [];
logs = Array.isArray(parsed) ? parsed : [];
}
} catch (err) {
console.warn('⚠️ Failed to read or parse query_logs.json — creating new log file.');
logs = [];
}

logs.push(log);
fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
}

module.exports = { logQuery };