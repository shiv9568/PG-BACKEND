const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  type: { type: String, enum: ['Food', 'Cleaning', 'Maintenance'], required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  userId: { type: String, required: true },
  userName: { type: String },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Rating', ratingSchema);
