const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String },
  bookingId: { type: String, required: true }, // Link to the booking
  pgId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Paid', 'Overdue', 'Verified'], default: 'Pending' },
  dueDate: { type: Date, required: true },
  paidDate: { type: Date },
  month: { type: String }, // e.g., "December 2025"
  transactionId: { type: String },
  screenshotUrl: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
