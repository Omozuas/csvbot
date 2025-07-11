const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
sessionId: { type: String, unique: true, required: true },
data: { type: [Object], required: true }, // enriched records
createdAt: { type: Date, default: Date.now, expires: '1h' } // auto-expire in 1 hour
});

module.exports = mongoose.model('Session', sessionSchema);