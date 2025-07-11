const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const { getCachedLogic, setCachedLogic } = require('../logic/gptCache');

async function getFilterLogic(nlQuery, previewSample = []) {
  const cached = getCachedLogic(nlQuery);
  if (cached) {
    console.log('✅ Using cached GPT logic from cache');
    return { type: 'function', content: cached };
  }

const prompt = `
You are an intelligent assistant analyzing tax data.

Your job is to answer user queries using real values from the structured records below.
Data Sample:
${JSON.stringify(previewSample.slice(0, 25), null, 2)}

User Query:
"${nlQuery}"

Your response must:
- Directly answer the question using the sample data
- Compute aggregates, names, totals, or filtered results as needed
- Provide a detailed explanation of how you interpreted the query and derived the answer
- Return NO code, NO filter logic, ONLY data-based answers
- Interpret the query clearly.
- Extract data directly from the sample to produce a real, factual answer.
- You must return actual values — not code, not logic.
- You must provide a complete and valid JSON object with 3 parts:
    - summary (a 1-line overview)
    - explanation (how the answer was derived)
    - data (list of results or aggregates)

Output format:
{
  "type": "answer",
  "content": {
    "summary": "One-line summary of what was found",
    "explanation": "Explain what the user asked, how you interpreted it, and how you computed this answer",
    "data": [
      ...list of actual values like names, counts, totals or matched records...
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

⚠️ VERY IMPORTANT:
- Do NOT include placeholder items like "...", "...remaining records", or incomplete arrays.
- Do NOT add comments or explanation after the JSON.
- If data exceeds 30 items, **truncate manually** and say so clearly in the explanation (e.g., "Only top 25 results shown").
- If fields are missing in the data, say so in the explanation.
- You must return only fully valid JSON. The response must be parsable by JavaScript.

Your response must follow the structure 100%. No exceptions.`;


  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
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

if (parsed.type === 'answer') {
  setCachedLogic(nlQuery, parsed.content);
}

console.log('✅ Parsed GPT response:', parsed.content);
return parsed;

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
