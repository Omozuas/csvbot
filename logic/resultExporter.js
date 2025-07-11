const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');

function exportToCSV(data, sessionId = null) {
  if (!data || data.length === 0) {
console.warn('⚠️ No data to export — skipping CSV generation.');
return null;
}


// Ensure output directory exists
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// Generate a filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = sessionId
? `result_${sessionId}_${timestamp}.csv`
: `result_${timestamp}.csv`;

const filepath = path.join(outputDir, filename);

try {
const parser = new Parser();
const csv = parser.parse(data);
fs.writeFileSync(filepath, csv);
return filepath;
} catch (err) {
console.error('❌ CSV export failed:', err);
return null;
}
}

module.exports = { exportToCSV };
