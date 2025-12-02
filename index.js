require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const Pg = require('./models/Pg');
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const jwt = require('jsonwebtoken');
const { protect, admin, caretaker } = require('./middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Notice = require('./models/Notice');
const Visitor = require('./models/Visitor');
const Rating = require('./models/Rating');
const Payment = require('./models/Payment');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Configure Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)) // Appending extension
  }
})

const upload = multer({ storage: storage });




const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '30d',
  });
};

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"]
  }
});

// Make io accessible in routes
app.set('io', io);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

// Connect to MongoDB
console.log('Attempting to connect to MongoDB at:', process.env.MONGODB_URI ? 'URI from env' : 'Localhost fallback');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tajpg')
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('Could not connect to MongoDB', err));

// Routes

app.get('/', (req, res) => {
  res.send('Taj PG Backend is running with MongoDB');
});

// PG Routes
app.get('/api/pgs', async (req, res) => {
  try {
    const pgs = await Pg.find().sort({ createdAt: -1 });
    res.json(pgs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/pgs', protect, admin, async (req, res) => {
  const newPg = new Pg({
    ...req.body,
    id: req.body.id || `pg-${Date.now()}`
  });

  try {
    const savedPg = await newPg.save();
    res.status(201).json(savedPg);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Auth Routes
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const newUser = new User({
      id: `user-${Date.now()}`,
      name,
      email,
      password, // In a real app, hash this!
    });

    await newUser.save();
    
    const { password: _, ...userWithoutPassword } = newUser.toObject();
    res.status(201).json({
      ...userWithoutPassword,
      token: generateToken(newUser.id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await User.findOne({ email, password }); // In real app, compare hashed password
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const { password: _, ...userWithoutPassword } = user.toObject();
    res.json({
      ...userWithoutPassword,
      token: generateToken(user.id),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Complaint Routes
app.post('/api/complaints', protect, async (req, res) => {
  try {
    const newComplaint = new Complaint(req.body);
    const savedComplaint = await newComplaint.save();
    
    const io = req.app.get('io');
    io.emit('complaintCreated', savedComplaint);
    
    res.status(201).json(savedComplaint);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/complaints', async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Complaint Status (Admin & Caretaker)
app.put('/api/complaints/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'caretaker') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    
    const io = req.app.get('io');
    io.emit('complaintUpdated', complaint);
    
    res.json(complaint);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

const Booking = require('./models/Booking');

// ... existing code ...

// Booking Routes
app.post('/api/bookings', protect, async (req, res) => {
  try {
    // Fetch PG to get price if rentAmount is missing
    const pg = await Pg.findOne({ id: req.body.pgId });
    const rentAmount = req.body.rentAmount || (pg ? pg.price : 0);

    const newBooking = new Booking({
      ...req.body,
      rentAmount
    });
    const savedBooking = await newBooking.save();
    
    // Optionally update User's bookings array if needed, but Booking model is source of truth
    await User.findOneAndUpdate(
      { id: req.body.userId }, 
      { $push: { bookings: req.body.pgId } }
    );

    const io = req.app.get('io');
    io.emit('bookingCreated', savedBooking);

    res.status(201).json(savedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete all bookings (Admin only)
app.delete('/api/bookings', protect, admin, async (req, res) => {
  try {
    await Booking.deleteMany({});
    // Clear user bookings arrays too
    await User.updateMany({}, { $set: { bookings: [] } });
    
    // Reset all PG occupancy
    await Pg.updateMany({}, { $set: { occupiedBeds: 0 } });
    
    // Emit event to update all clients (we might need a 'pgsUpdated' event or just rely on refresh)
    const io = req.app.get('io');
    const pgs = await Pg.find();
    pgs.forEach(pg => io.emit('pgUpdated', pg));

    res.json({ message: 'All bookings cleared' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete a specific booking (Admin only)
app.delete('/api/bookings/:id', protect, admin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (booking) {
      await Booking.findByIdAndDelete(req.params.id);
      // Remove from user's bookings array
      await User.updateOne(
        { id: booking.userId },
        { $pull: { bookings: booking.pgId } }
      );

      // Update PG Occupancy if booking was confirmed
      if (booking.status === 'Confirmed') {
        const pg = await Pg.findOne({ id: booking.pgId });
        if (pg && pg.occupiedBeds > 0) {
          pg.occupiedBeds -= 1;
          await pg.save();
          const io = req.app.get('io');
          io.emit('pgUpdated', pg);
        }
      }

      res.json({ message: 'Booking removed' });
    } else {
      res.status(404).json({ message: 'Booking not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin & Caretaker Routes

// Update PG (Admin only)
app.put('/api/pgs/:id', protect, admin, async (req, res) => {
  try {
    const updatedPg = await Pg.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
    res.json(updatedPg);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete PG (Admin only)
app.delete('/api/pgs/:id', protect, admin, async (req, res) => {
  try {
    await Pg.findOneAndDelete({ id: req.params.id });
    res.json({ message: 'PG removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Booking Status (Admin/Caretaker)
// Update Booking Status (Admin/Caretaker/User)
app.put('/api/bookings/:id', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const newStatus = req.body.status;
    
    // Permission check
    if (req.user.role !== 'admin' && req.user.role !== 'caretaker') {
      // Normal user can only cancel their own booking
      // Access custom 'id' field from raw document to avoid Mongoose virtual 'id' (which is _id)
      const currentUserId = req.user._doc ? req.user._doc.id : req.user.id;
      
      if (booking.userId !== currentUserId) {
        return res.status(403).json({ message: 'Not authorized' });
      }
      if (newStatus !== 'Canceled') {
        return res.status(403).json({ message: 'Users can only cancel bookings' });
      }
    }

    const oldStatus = booking.status;
    booking.status = newStatus || booking.status;
    if (req.body.checkInDate) booking.checkInDate = req.body.checkInDate;
    
    // Check occupancy before confirming
    if (newStatus === 'Confirmed' && oldStatus !== 'Confirmed') {
      const pg = await Pg.findOne({ id: booking.pgId });
      if (pg) {
        if (pg.occupiedBeds >= pg.totalBeds) {
          return res.status(400).json({ message: 'PG is full. Cannot confirm booking.' });
        }
        // Increment occupancy
        pg.occupiedBeds += 1;
        await pg.save();
        const io = req.app.get('io');
        io.emit('pgUpdated', pg);

        // Create Payment Record for current month
        const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
        const existingPayment = await Payment.findOne({ bookingId: booking._id, month });
        
        if (!existingPayment) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 5); // Due in 5 days
          
          const newPayment = new Payment({
            userId: booking.userId,
            userName: booking.userName,
            bookingId: booking._id,
            pgId: booking.pgId,
            amount: booking.rentAmount || pg.price, // Fallback to PG price if rentAmount not in booking
            dueDate: dueDate,
            month: month,
            status: 'Pending'
          });
          await newPayment.save();
          
          const io = req.app.get('io');
          io.emit('paymentCreated', newPayment);
        }
      }
    } else if ((newStatus === 'Canceled' || newStatus === 'Rejected' || newStatus === 'CheckedOut') && oldStatus === 'Confirmed') {
      const pg = await Pg.findOne({ id: booking.pgId });
      if (pg && pg.occupiedBeds > 0) {
        pg.occupiedBeds -= 1;
        await pg.save();
        const io = req.app.get('io');
        io.emit('pgUpdated', pg);
      }
    }
    
    const updatedBooking = await booking.save();
    
    const io = req.app.get('io');
    io.emit('bookingUpdated', updatedBooking);
    
    res.json(updatedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Create a new user (Admin only)
app.post('/api/users', protect, admin, async (req, res) => {
  const { name, email, password, role, phoneNumber, assignedPgId } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    const newUser = new User({
      id: `user-${Date.now()}`,
      name,
      email,
      password, // In real app, hash this
      role,
      phoneNumber,
      assignedPgId
    });

    await newUser.save();
    
    const { password: _, ...userWithoutPassword } = newUser.toObject();
    res.status(201).json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users (Admin only)
app.get('/api/users', protect, admin, async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Dashboard Stats (Admin only)
// Dashboard Stats (Admin only)
app.get('/api/admin/stats', protect, admin, async (req, res) => {
  try {
    const totalPgs = await Pg.countDocuments();
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalBookings = await Booking.countDocuments();
    
    // Calculate Revenue from Paid bookings
    const revenueResult = await Booking.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, total: { $sum: "$rentAmount" } } }
    ]);
    const revenue = revenueResult[0] ? revenueResult[0].total : 0;

    // Calculate Occupancy Rate
    const pgs = await Pg.find();
    let totalBeds = 0;
    let occupiedBeds = 0;
    pgs.forEach(pg => {
      totalBeds += pg.totalBeds || pg.capacity || 0;
      occupiedBeds += pg.occupiedBeds || 0;
    });
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    
    res.json({
      totalPgs,
      totalUsers,
      totalBookings,
      revenue,
      occupancyRate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Seed Admin and Caretaker
const seedUsers = async () => {
  try {
    const adminEmail = 'admin@gmail.com';
    const caretakerEmail = 'caretaker@gmail.com';

    const adminExists = await User.findOne({ email: adminEmail });
    if (!adminExists) {
      const adminUser = new User({
        id: `admin-${Date.now()}`,
        name: 'Admin User',
        email: adminEmail,
        password: 'admin123', // In real app, hash this
        role: 'admin',
        phoneNumber: '9999999999'
      });
      await adminUser.save();
      console.log('Admin user created: admin@gmail.com / admin123');
    }

    const caretakerExists = await User.findOne({ email: caretakerEmail });
    if (!caretakerExists) {
      const caretakerUser = new User({
        id: `caretaker-${Date.now()}`,
        name: 'Caretaker User',
        email: caretakerEmail,
        password: 'caretaker123', // In real app, hash this
        role: 'caretaker',
        phoneNumber: '8888888888'
      });
      await caretakerUser.save();
      console.log('Caretaker user created: caretaker@gmail.com / caretaker123');
    }
  } catch (error) {
    console.error('Seeding error:', error);
  }
};

// Recalculate Occupancy for all PGs
const recalculateOccupancy = async () => {
  try {
    const pgs = await Pg.find();
    for (const pg of pgs) {
      const confirmedBookingsCount = await Booking.countDocuments({ 
        pgId: pg.id, 
        status: 'Confirmed' 
      });
      
      if (pg.occupiedBeds !== confirmedBookingsCount) {
        console.log(`Fixing occupancy for PG ${pg.name}: ${pg.occupiedBeds} -> ${confirmedBookingsCount}`);
        pg.occupiedBeds = confirmedBookingsCount;
        await pg.save();
      }
    }
    console.log('Occupancy recalculation complete');
  } catch (error) {
    console.error('Error recalculating occupancy:', error);
  }
};

// --- File Upload Route ---
app.post('/api/upload', protect, upload.single('file'), (req, res) => {
  if (req.file) {
    res.json({ 
      message: 'File uploaded successfully', 
      filePath: `/uploads/${req.file.filename}` 
    });
  } else {
    res.status(400).json({ message: 'No file uploaded' });
  }
});

// --- Notice Routes ---
app.get('/api/notices', async (req, res) => {
  try {
    const notices = await Notice.find().sort({ date: -1 });
    res.json(notices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/notices', protect, admin, async (req, res) => {
  try {
    const notice = new Notice(req.body);
    await notice.save();
    
    const io = req.app.get('io');
    io.emit('noticeCreated', notice);
    
    res.status(201).json(notice);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/notices/:id', protect, admin, async (req, res) => {
  try {
    await Notice.findByIdAndDelete(req.params.id);
    
    const io = req.app.get('io');
    io.emit('noticeDeleted', req.params.id);
    
    res.json({ message: 'Notice removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- Visitor Routes ---
app.get('/api/visitors', protect, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'caretaker') {
      // If caretaker has assignedPgId, filter by it. 
      // For now, assuming caretaker sees all or we filter by their ID if we stored it.
      // The Visitor model has caretakerId.
      query = { caretakerId: req.user.id };
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const visitors = await Visitor.find(query).sort({ timeIn: -1 });
    res.json(visitors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/visitors', protect, caretaker, async (req, res) => {
  try {
    const visitor = new Visitor({
      ...req.body,
      caretakerId: req.user.id,
      // pgId should be passed in body or derived from caretaker's assigned PG
      // Assuming caretaker has assignedPgId in their user profile
    });
    
    // If pgId is not in body, try to get from caretaker
    if (!visitor.pgId && req.user.assignedPgId) {
      visitor.pgId = req.user.assignedPgId;
    }
    
    await visitor.save();
    res.status(201).json(visitor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/visitors/:id/checkout', protect, caretaker, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (visitor) {
      visitor.timeOut = Date.now();
      await visitor.save();
      res.json(visitor);
    } else {
      res.status(404).json({ message: 'Visitor not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- Rating Routes ---
app.get('/api/ratings', protect, admin, async (req, res) => {
  try {
    const ratings = await Rating.find().sort({ date: -1 });
    res.json(ratings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/ratings', protect, async (req, res) => {
  try {
    const rating = new Rating({
      ...req.body,
      userId: req.user.id,
      userName: req.user.name
    });
    await rating.save();
    res.status(201).json(rating);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// --- Payment Routes ---
app.post('/api/payments/generate', protect, admin, async (req, res) => {
  try {
    // Generate rent for all confirmed bookings
    const bookings = await Booking.find({ status: 'Confirmed' });
    const payments = [];
    
    const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5); // Due in 5 days
    
    for (const booking of bookings) {
      // Check if payment already exists for this month
      const existing = await Payment.findOne({ bookingId: booking._id, month });
      if (!existing) {
        const payment = new Payment({
          userId: booking.userId,
          userName: booking.userName,
          bookingId: booking._id,
          pgId: booking.pgId,
          amount: booking.rentAmount,
          dueDate: dueDate,
          month: month,
          status: 'Pending'
        });
        await payment.save();
        payments.push(payment);
      }
    }
    
    const io = req.app.get('io');
    payments.forEach(p => io.emit('paymentCreated', p));
    
    res.json({ message: `Generated ${payments.length} rent requests`, payments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/payments', protect, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'user') {
      query.userId = req.user.id;
    } else if (req.user.role === 'caretaker') {
      query.pgId = req.user.assignedPgId;
    }
    
    const payments = await Payment.find(query).sort({ dueDate: 1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/payments/:id', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    
    console.log(`Updating payment ${req.params.id}. User role: ${req.user.role}, Body:`, req.body);

    // User can mark as Paid (upload screenshot)
    if (req.user.role === 'user') {
      if (payment.userId !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
      
      payment.status = 'Paid'; // Or 'VerificationPending' if you want strict flow
      payment.transactionId = req.body.transactionId;
      payment.screenshotUrl = req.body.screenshotUrl;
      payment.paidDate = Date.now();
    } 
    // Admin can verify
    else if (req.user.role === 'admin') {
      console.log('Admin updating status to:', req.body.status);
      payment.status = req.body.status || payment.status;
      // If marking as Paid/Verified and no paidDate, set it
      if ((payment.status === 'Paid' || payment.status === 'Verified') && !payment.paidDate) {
        payment.paidDate = Date.now();
      }
    }
    
    await payment.save();
    console.log('Payment saved with status:', payment.status);
    
    const io = req.app.get('io');
    io.emit('paymentUpdated', payment);
    
    // Update Booking payment status if needed
    if (payment.status === 'Paid' || payment.status === 'Verified') {
      await Booking.findByIdAndUpdate(payment.bookingId, { 
        paymentStatus: 'Paid',
        nextPaymentDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
      });
    }
    
    res.json(payment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// --- KYC Routes ---
app.put('/api/users/:id/kyc', protect, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.kycDocumentUrl = req.body.kycDocumentUrl;
    user.kycStatus = 'Pending';
    await user.save();
    
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/users/:id/kyc-status', protect, admin, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.kycStatus = req.body.status; // Approved, Rejected
    if (req.body.reason) user.kycRejectionReason = req.body.reason;
    
    await user.save();
    
    // Notify user via socket
    const io = req.app.get('io');
    // Ideally emit to specific user room, but for now broadcast or client polls
    io.emit('userUpdated', user); 
    
    res.json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// --- Reports Route ---
app.get('/api/admin/reports/revenue', protect, admin, async (req, res) => {
  try {
    const bookings = await Booking.find({ paymentStatus: 'Paid' });
    
    // Simple CSV generation
    let csv = 'Booking ID,User,PG Name,Amount,Date\n';
    bookings.forEach(b => {
      csv += `${b.id},${b.userName},${b.pgName},${b.amount},${new Date(b.createdAt).toISOString()}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('revenue_report.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Manual Fix Endpoint
app.get('/api/admin/fix-occupancy', async (req, res) => {
  try {
    await recalculateOccupancy();
    
    // Emit update for all PGs
    const io = req.app.get('io');
    const pgs = await Pg.find();
    pgs.forEach(pg => io.emit('pgUpdated', pg));
    
    res.json({ message: 'Occupancy recalculated and synced' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Connect to MongoDB
console.log('Attempting to connect to MongoDB at:', process.env.MONGODB_URI ? 'URI from env' : 'Localhost fallback');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tajpg')
.then(() => {
  console.log('Connected to MongoDB');
  seedUsers();
  recalculateOccupancy();
})
.catch(err => console.error('Could not connect to MongoDB', err));

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
