
const Session = require('../model/session');
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function handleConversationalFollowUp(sessionId, nlQuery) {
const session = await Session.findOne({ sessionId });
if (!session) throw new Error('Session not found.');

const data = session.data;

// For large CSVs, just use a sample or summary
const preview = data.slice(0, 25); // limit to 25 records
const previewString = JSON.stringify(preview, null, 2);

const prompt = `
You are an AI CSV analyst. The user uploaded a dataset and is now asking a question about it.

Here are 25 rows of the dataset:
${previewString}

User's question:
"${nlQuery}"

Answer as clearly and accurately as possible.
If you're unsure or it's not answerable from the data, say so.
`;

try {
const response = await openai.chat.completions.create({
model: 'gpt-3.5-turbo',
messages: [{ role: 'user', content: prompt }],
temperature: 0.2,
});


return {
  sessionId,
  question: nlQuery,
  answer: response.choices[0].message.content.trim(),
};
} catch (err) {
console.error('❌ GPT conversation failed:', err.message);
throw new Error('Unable to answer your question right now.');
}
}

module.exports = { handleConversationalFollowUp };