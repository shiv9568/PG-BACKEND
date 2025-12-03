const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String },
  pgId: { type: String, required: true },
  pgName: { type: String },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Rejected', 'CheckedOut', 'Canceled'], default: 'Pending' },
  checkInDate: { type: Date },
  paymentStatus: { type: String, enum: ['Paid', 'Pending', 'Overdue'], default: 'Pending' },
  rentAmount: { type: Number },
  roomNo: { type: String },
  nextPaymentDate: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
