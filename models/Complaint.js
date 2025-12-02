const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String }, // Optional, for easier display
  pgId: { type: String }, // To link complaint to a PG
  roomName: { type: String }, // Optional, if linked to a specific room
  issueType: { type: String, required: true }, // e.g., 'Plumbing', 'Electrical', 'Food', 'Other'
  description: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
