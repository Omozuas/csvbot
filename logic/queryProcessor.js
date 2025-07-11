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

async function handleQuery(nlQuery, transactionsBuffer, payersBuffer) {
  const [taxData, payers] = await Promise.all([
    parseCSVFromBuffer(transactionsBuffer),
    parseCSVFromBuffer(payersBuffer)
  ]);

  const payerMap = Object.fromEntries(payers.map(p => [p.insurance_number, p]));

  const enriched = taxData.map(tx => ({
    ...tx,
    Transaction_amount: parseFloat(tx.Transaction_amount),
    Expected_Tax_Amount: parseFloat(tx.Expected_Tax_Amount),
    Tax_Amount_Paid: parseFloat(tx.Tax_Amount_Paid),
    ...payerMap[tx.Custiner_TIN]
  }));

  let logicBody = getCachedLogic(nlQuery);
  if (!logicBody) {
    logicBody = await getFilterLogic(nlQuery);
    setCachedLogic(nlQuery, logicBody);
  }

  let filterFn;
  try {
    filterFn = eval(`(record) => { ${logicBody} }`);
  } catch (err) {
    throw new Error('Invalid GPT logic');
  }
const sessionId = uuidv4();
  const filtered = enriched.filter(filterFn);

  // ✅ Export results to CSV
  const csvPath = exportToCSV(filtered,sessionId);

  // ✅ Log query
  logQuery(nlQuery, filtered, csvPath, sessionId);
let downloadUrl = null;
if (csvPath) {
const filename = path.basename(csvPath);
downloadUrl = `/download/${filename}`;
}
// Generate sessionId and save to MongoDB

await Session.create({ sessionId, data: enriched });

return {
sessionId,
matchCount: filtered.length,
csvExport: csvPath|| 'No CSV generated (empty result)',
result: filtered,
downloadUrl
};
}

module.exports = { handleQuery , parseCSVFromBuffer };
