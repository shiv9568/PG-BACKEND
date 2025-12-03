const mongoose = require('mongoose');

const pgSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // Keeping string ID for compatibility with frontend for now
  adminId: { type: String }, // ID of the admin who manages this PG
  name: { type: String, required: true },
  location: { type: String, required: true },
  gender: { type: String, enum: ['Male', 'Female', 'Any'], required: true },
  price: { type: Number, required: true },
  amenities: [{ type: String }],
  rating: { type: Number, default: 0 },
  images: [{ type: String }],
  mapUrl: { type: String },
  description: { type: String },
  capacity: { type: Number, default: 1 },
  block: { type: String },
  floor: { type: Number },
  totalBeds: { type: Number, required: true, default: 1 },
  occupiedBeds: { type: Number, default: 0 },
  rooms: [{ type: String }], // List of room numbers e.g. ["101", "102"]
  rules: [{ type: String }],
  timings: { type: String },
  caretakerContact: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Pg', pgSchema, 'pg');
