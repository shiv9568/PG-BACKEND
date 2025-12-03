const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  purpose: { type: String, required: true },
  roomNo: { type: String },
  adharNo: { type: String }, // Added Adhar No
  
  // Linking fields
  pgId: { type: String }, // Made optional as per request
  caretakerId: { type: String }, // ID of caretaker who logged this
}, { timestamps: true });

module.exports = mongoose.model('Visitor', visitorSchema);
