const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getCachedLogic, setCachedLogic } = require('../logic/gptCache');
const { encode } = require('gpt-3-encoder'); // for token-safe previews


function estimateTokens(text) {
  return encode(text).length;
}

function trimPreviewSample(previewSample, tokenLimit = 1500) {
  const rows = [];
  let totalTokens = 0;

  for (const row of previewSample) {
    const json = JSON.stringify(row, null, 2);
    const tokens = estimateTokens(json);
    if (totalTokens + tokens > tokenLimit) break;
    rows.push(row);
    totalTokens += tokens;
  }

  return rows;
}

async function getFilterLogic(nlQuery, previewSample = [], multiTablePreview = '') {
  const cached = getCachedLogic(nlQuery);
  if (cached) {
    console.log('✅ Using cached GPT logic from cache');
    return { type: 'answer', content: cached };
  }

   // 🛡️ If no preview data, avoid calling GPT blindly
  if (!previewSample || previewSample.length === 0) {
    return {
      type: 'message',
      content: 'No data preview was available for GPT to interpret. Please upload or load a dataset.'
    };
  }

  const trimmedSample = trimPreviewSample(previewSample);
  const sampleText = multiTablePreview || JSON.stringify(trimmedSample, null, 2);

const prompt = `
You are an intelligent assistant analyzing tabular tax data.

Your job is to:
- Understand user queries
- Output a structured JSON logic object OR full answer depending on the complexity
- Use the provided data to extract real values below

Data Preview:
${sampleText}

User Query:
"${nlQuery}"

Your response must:
- Use only the data and fields shown
- Extract real values from the sample data
- Compute aggregates, names, totals, or filtered results
- Provide a clear and factual explanation of how you interpreted the query
- Return ONLY a valid JSON object with:
    - summary (1–2 line overview)
    - explanation (how it was computed)
    - data (actual results — names, counts, amounts, etc.)
- DO NOT return code, logic, or placeholder symbols like "..." or "remaining records"
- DO NOT truncate the array — return all matching records
- DO NOT invent fields not present in the table
- Return only valid JSON that can be parsed in JavaScript
- Only the first 30 rows of each table were shown to you.
  Use this sample to understand field names and structure.

Output format:

{
  "type": "logic",
  "content": {
    "summary": "summary of what user asked",
    "explanation": "how you interpreted it",
    "operation": {
      "type": "filter | groupBy | aggregate | topK",
      "field": "Field to operate on",
      "operator": "== | != | > | < | contains | in | sum | count",
      "value": "Value or array of values",
      "groupByField": "if groupBy is used",
      "aggregateField": "if aggregate is used"
    }
  }
}

{
  "type": "answer",
  "content": {
    "summary": "One-line or two-line summary of what was found",
    "explanation": "Explain what the user asked, how you interpreted it, and how you computed this answer",
    "data": [
      ...list of actual values like names, counts,metrics, totals or matched records...
    ]
  }
}

Examples:

User: "Give me all the names"
Return:
{
  "type": "answer",
  "content": {
    "summary": "25 unique names were found in the data.",
    "explanation": "The user requested names. I extracted the 'payer_name' or 'Name' field from each record.",
    "data": [
      { "name": "Tolu" },
      { "name": "Tobi" },
      ...
    ]
  }
}

User: "How many people have at least 10 transactions?"
Return:
{
  "type": "answer",
  "content": {
    "summary": "3 people had 10 or more transactions.",
    "explanation": "I grouped records by payer, counted their transactions, and selected those with 10 or more.",
    "data": [
      { "name": "Tobi", "transactionCount": 14 },
      { "name": "Tolu", "transactionCount": 12 },
      { "name": "Ali", "transactionCount": 10 }
    ]
  }
}


User: "List all company names"
→ Return:
{
  "type": "answer",
  "content": {
    "summary": "25 company names were found.",
    "explanation": "Extracted 'Name' field from all rows in the data.",
    "data": [
      { "name": "Alex Smith Ltd" },
      { "name": "Zara Co." },
      ...
    ]
  }
}

User: "How many companies paid over ₦10,000 in tax?"
→ Return:
{
  "type": "answer",
  "content": {
    "summary": "4 companies paid more than ₦10,000.",
    "explanation": "Filtered records by 'Tax_Amount_Paid > 10000'.",
    "data": [
      { "name": "Tolu Ltd", "taxPaid": 12000 },
      { "name": "Zara Ventures", "taxPaid": 15000 },
      ...
    ]
  }
}
{
  "type": "logic",
  "content": {
    "summary": "Companies that paid more than ₦10,000",
    "explanation": "Filtered where Tax_Amount_Paid > 10000",
    "operation": {
      "type": "filter",
      "field": "Tax_Amount_Paid",
      "operator": ">",
      "value": 10000
    }
  }
}


Your response must follow the structure 100%. No exceptions.`;


  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    });

    const raw = response.choices[0].message.content.trim();
const parsed = cleanAndParseJSON(raw);

if (!parsed) {
  console.error('❌ GPT returned invalid JSON:', raw);
  return {
    type: 'message',
    content: 'Sorry, I could not understand your request.'
  };
}

   // Cache answer or logic (but not "message" responses)
    if (parsed.type === 'logic' || parsed.type === 'answer') {
      setCachedLogic(nlQuery, parsed.content);
      console.log(`✅ GPT returned ${parsed.type} successfully`);
      return parsed;
    }
  } catch (err) {
    console.error('❌ OpenAI error:', err.message);

    return {
      type: 'message',
      content: 'Sorry, I could not process your query at this time.'
    };
  }
}

function cleanAndParseJSON(raw) {
  try {
    // Remove any fake continuation markers GPT adds (like "...", "...(remaining records)")
    const cleaned = raw.replace(/\.{3,}.*?(\n|$)/g, '').trim();

    // Now try parsing again
    return JSON.parse(cleaned);
  }catch (e1) {
    // Attempt to fix truncated JSON
    const braceOpen = raw.lastIndexOf('{');
    const braceClose = raw.lastIndexOf('}');
    const bracketOpen = raw.lastIndexOf('[');
    const bracketClose = raw.lastIndexOf(']');

    const lastClosing = Math.max(braceClose, bracketClose);
    if (lastClosing === -1) return null;

    const safeSlice = raw.slice(0, lastClosing + 1);

    try {
      return JSON.parse(safeSlice);
    } catch (e2) {
      console.error('🛑 Still failed after final safe slice:', e2.message);
      return null;
    }
  }
}


module.exports = { getFilterLogic };

