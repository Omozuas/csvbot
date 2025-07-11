const Session = require('../models/Session');
const { getFilterLogic } = require('../openai/interpreter');
const { getCachedLogic, setCachedLogic } = require('./gptCache');
const { exportToCSV } = require('./resultExporter');
const { logQuery } = require('./logger');

async function handleFollowUp(sessionId, nlQuery) {
const session = await Session.findOne({ sessionId });

if (!session) {
throw new Error('Session not found. Please upload your CSVs again.');
}

const enriched = session.data;

// Reuse cached GPT logic or get new one
let logic = getCachedLogic(nlQuery);
if (!logic) {
logic = await getFilterLogic(nlQuery);
setCachedLogic(nlQuery, logic);
}

let filterFn;
try {
filterFn = eval(`(record) => { ${logic} }`);
} catch (err) {
throw new Error('Invalid GPT logic.');
}

const filtered = enriched.filter(filterFn);
const csvPath = exportToCSV(filtered);
logQuery(nlQuery, filtered, csvPath);

// 7. Safely build download link
let downloadUrl = null;
if (csvPath) {
const filename = path.basename(csvPath);
downloadUrl = `/download/${filename}`;
}

return {
sessionId,
matchCount: filtered.length,
csvExport: csvPath || 'No CSV generated (no matches)',
downloadUrl,
result: filtered
};
}

module.exports = { handleFollowUp };

