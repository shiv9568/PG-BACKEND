const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  purpose: { type: String, required: true },
  whomToMeet: { type: String }, // Student Name
  timeIn: { type: Date, default: Date.now },
  timeOut: { type: Date },
  
  // Linking fields
  pgId: { type: String, required: true },
  caretakerId: { type: String }, // ID of caretaker who logged this
}, { timestamps: true });

module.exports = mongoose.model('Visitor', visitorSchema);
