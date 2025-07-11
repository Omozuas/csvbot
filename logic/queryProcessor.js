const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { getFilterLogic } = require('../openai/interpreter');
const { getCachedLogic, setCachedLogic } = require('./gptCache');
const { logQuery } = require('./logger');
const { exportToCSV } = require('./resultExporter');
const { v4: uuidv4 } = require('uuid');
const Session = require('../model/session');

function parseCSVFromBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const stream = Readable.from(buffer);
    const results = [];
    stream
      .pipe(csv())
      .on('data', data => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

/**
 * @param {string} nlQuery - natural language query
 * @param {Object} csvBuffers - key-value pairs { fileName: buffer }
 */
async function handleQuery(nlQuery, csvBuffers) {
  if (!nlQuery || !csvBuffers || Object.keys(csvBuffers).length === 0) {
    throw new Error('Query and CSV files are required.');
  }

  // ✅ Parse each CSV buffer
  const parsedTables = {};
  for (const [filename, buffer] of Object.entries(csvBuffers)) {
    const rows = await parseCSVFromBuffer(buffer);
    if (!Array.isArray(rows)) throw new Error(`Invalid CSV content in ${filename}`);
    const name = filename.replace(/\..*$/, ''); // strip .csv extension
    parsedTables[name] = rows;
  }

  // ✅ Prepare preview for GPT
  const previewText = Object.entries(parsedTables)
    .map(([tableName, rows]) => {
      const fields = Object.keys(rows[0] || {});
      const preview = rows.slice(0, 5);
      return `📁 Table: ${tableName}\nFields: ${fields.join(', ')}\nSample:\n${JSON.stringify(preview, null, 2)}`;
    })
    .join('\n\n');

  const firstTable = Object.values(parsedTables)[0] || [];
  const previewSample = firstTable;
  const sessionId = uuidv4();

  // 🔍 Check cache
  let answer = getCachedLogic(nlQuery);

  if (!answer) {
    const interpretation = await getFilterLogic(nlQuery, previewSample, previewText);

    if (!interpretation || interpretation.type !== 'answer') {
      throw new Error('Unsupported GPT response or failed to parse');
    }

    answer = interpretation.content;
    setCachedLogic(nlQuery, answer);
  }

  const { summary, explanation, data } = answer;

  const csvPath = Array.isArray(data) && data.length && typeof data[0] === 'object'
    ? exportToCSV(data, sessionId)
    : null;

  const downloadUrl = csvPath ? `/download/${path.basename(csvPath)}` : null;

  // ✅ Save session
  await Session.create({ sessionId, data: parsedTables });

  // ✅ Log query + result
  logQuery(nlQuery, data, csvPath, sessionId);

  return {
    sessionId,
    summary,
    explanation,
    matchCount: Array.isArray(data) ? data.length : 0,
    result: data,
    csvExport: csvPath || 'No CSV generated (empty or invalid result)',
    downloadUrl,
    tables: Object.keys(parsedTables)
  };
}

module.exports = { handleQuery, parseCSVFromBuffer };
