const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'caretaker'], default: 'user' },
  phoneNumber: { type: String },
  assignedPgId: { type: String }, // For caretakers
  
  // KYC Fields
  kycStatus: { type: String, enum: ['NotUploaded', 'Pending', 'Approved', 'Rejected'], default: 'NotUploaded' },
  kycDocumentUrl: { type: String },
  kycRejectionReason: { type: String },
  
  bookings: [{ type: String }], // Array of PG IDs
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
