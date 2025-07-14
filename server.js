const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyPerser=require('body-parser');
// const session = require('express-session');
const dotenv = require('dotenv');
const cors =require('cors');
const cookieParser = require('cookie-parser')
const morgan = require('morgan');
const multer = require('multer');
const dbConnect = require('./db/dbConnection');
const { parseCSVFromBuffer } = require('./logic/queryProcessor');
const { getFilterLogic } = require('./openai/interpreter');
const { exportToCSV } = require('./logic/resultExporter');
const { logQuery } = require('./logic/logger');
const { v4: uuidv4 } = require('uuid');
const Session = require('./model/session');


dotenv.config();
dbConnect();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(morgan('dev'));
app.use(bodyPerser.json());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());

app.post('/query', upload.fields([
  { name: 'transactions' },
  { name: 'payers' }
]), async (req, res) => {
  try {
    const { sessionId, query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    let enriched = [];
    let sid = sessionId;

    // 🚀 Step 1: Handle session or upload
    if (sid) {
      const existing = await Session.findOne({ sessionId: sid });
      if (!existing) {
        return res.status(404).json({ error: 'Session not found. Upload CSVs again.' });
      }
      enriched = existing.data;
    } else {
      const transactionsFile = req.files.transactions?.[0];
      const payersFile = req.files.payers?.[0];

      if (!transactionsFile || !payersFile) {
        return res.status(400).json({ error: 'CSV files are required for first query.' });
      }

      const [transactions, payers] = await Promise.all([
        parseCSVFromBuffer(transactionsFile.buffer),
        parseCSVFromBuffer(payersFile.buffer)
      ]);

      // 🧠 Join transactions with payer info
      const payerMap = Object.fromEntries(payers.map(p => [p.Payer_id, p]));

      enriched = transactions.map(tx => {
        const payer = payerMap[tx.Custiner_TIN] || {};
        return {
          ...tx,
          Transaction_amount: parseFloat(tx.Transaction_amount),
          Expected_Tax_Amount: parseFloat(tx.Expected_Tax_Amount),
          Tax_Amount_Paid: parseFloat(tx.Tax_Amount_Paid),
          ...payer
        };
      });

      sid = uuidv4();
      await Session.create({ sessionId: sid, data: enriched });
    }

    // 🧠 Step 2: Ask GPT to interpret the query
    const preview = enriched.slice(0, 25);
    const interpretation = await getFilterLogic(query, preview);

    // 🧾 Step 3: Handle supported response types
    if (interpretation.type === 'answer') {
      const { summary, explanation, data } = interpretation.content;

      // Save export for download if data is array of objects
      const csvPath = Array.isArray(data) && data.length && typeof data[0] === 'object'
        ? exportToCSV(data, sid)
        : null;

      const filename = csvPath ? path.basename(csvPath) : null;
      const downloadUrl = filename ? `/download/${filename}` : null;

      logQuery(query, data, csvPath, sid);

      return res.json({
        sessionId: sid,
        mode: 'answer',
        summary,
        explanation,
        result: data,
        downloadUrl
      });
    }

    // Fallback for casual messages
    if (interpretation.type === 'message') {
      return res.json({
        sessionId: sid,
        mode: 'chat',
        answer: interpretation.content
      });
    }

    // If not supported, error out
    return res.status(400).json({ error: 'Unsupported GPT response type.' });

  } catch (err) {
    console.error('[ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// CSV file download
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'output', req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  res.download(filePath, err => {
    if (err) {
      console.error('❌ Error sending file:', err);
      res.status(500).json({ error: 'Download failed.' });
    }
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
