const mongoose = require('mongoose');

const entryLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  pgId: { type: String, required: true },
  type: { type: String, enum: ['Entry', 'Exit'], required: true },
  scannedBy: { type: String, required: true }, // Caretaker ID
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('EntryLog', entryLogSchema);
