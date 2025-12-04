require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const Pg = require('./models/Pg');
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const jwt = require('jsonwebtoken');
const { protect, admin, superAdmin, caretaker } = require('./middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');

const Notice = require('./models/Notice');
const Visitor = require('./models/Visitor');
const Rating = require('./models/Rating');
const Payment = require('./models/Payment');
const EntryLog = require('./models/EntryLog');

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
    origin: [
      "https://tajpg.vercel.app",
      "https://tajpg-pwglk9jzh-shiv9568s-projects.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
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

app.use(cors({
  origin: [
    "https://tajpg.vercel.app",
    "https://tajpg-pwglk9jzh-shiv9568s-projects.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
app.use('/api', limiter); // Apply to all API routes

// Database connection is handled at the end of the file

// Routes

app.get('/', (req, res) => {
  res.send('Taj PG Backend is running with MongoDB');
});

// PG Routes
app.get('/api/pgs', async (req, res) => {
  try {
    let query = {};
    
    // If user is logged in and is an admin (but not superadmin), only show their PGs
    // We need to handle the case where this might be a public request (no token) vs an admin request
    // For now, let's assume public requests show all PGs (for listing), 
    // but we might want to filter if we had a "my-pgs" endpoint.
    // However, the requirement is "manage multiple PG instances".
    
    // Let's check if there is a token to decide context, or rely on a specific query param or endpoint.
    // Simpler approach: If the user is authenticated as an admin, we filter.
    // But this is a public route too.
    // Let's keep this public for now.
    // We'll create a separate endpoint or logic for "My PGs" if needed, 
    // or just filter on the frontend if we send all.
    // BUT, for security, admins shouldn't see other admins' PGs details if they are private.
    // Given the current app structure, let's modify this to support filtering if a query param is present,
    // or better, check the token manually if present.
    
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
            const user = await User.findOne({ id: decoded.id });
            if (user && user.role === 'admin') {
                query = { adminId: user.id };
            }
            // Superadmin sees all (empty query)
        } catch (e) {
            // Ignore token error, treat as public
        }
    }

    const pgs = await Pg.find(query).sort({ createdAt: -1 });
    res.json(pgs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/pgs', protect, admin, async (req, res) => {
  const newPg = new Pg({
    ...req.body,
    id: req.body.id || `pg-${Date.now()}`,
    adminId: req.user.role === 'superadmin' ? (req.body.adminId || req.user.id) : req.user.id
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
    // Check if user already has an active booking
    const existingBooking = await Booking.findOne({ 
      userId: req.body.userId, 
      status: { $in: ['Pending', 'Confirmed'] } 
    });

    if (existingBooking) {
      return res.status(400).json({ message: 'You already have an active booking. You can only book one room at a time.' });
    }

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
    const query = { id: req.params.id };
    if (req.user.role === 'admin') {
        query.adminId = req.user.id;
    }
    
    const updatedPg = await Pg.findOneAndUpdate(query, req.body, { new: true });
    if (!updatedPg) {
        return res.status(404).json({ message: 'PG not found or unauthorized' });
    }
    res.json(updatedPg);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete PG (Admin only)
app.delete('/api/pgs/:id', protect, admin, async (req, res) => {
  try {
    const query = { id: req.params.id };
    if (req.user.role === 'admin') {
        query.adminId = req.user.id;
    }

    const pg = await Pg.findOneAndDelete(query);
    if (!pg) {
        return res.status(404).json({ message: 'PG not found or unauthorized' });
    }
    res.json({ message: 'PG removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- Super Admin Routes ---

// Create a new Admin (Super Admin only)
app.post('/api/superadmin/admins', protect, superAdmin, async (req, res) => {
    const { name, email, password, phoneNumber } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }
  
    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ message: 'User already exists' });
      }
  
      const newAdmin = new User({
        id: `admin-${Date.now()}`,
        name,
        email,
        password, // In real app, hash this
        role: 'admin',
        phoneNumber
      });
  
      await newAdmin.save();
      
      const { password: _, ...userWithoutPassword } = newAdmin.toObject();
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
});

// Get all Admins (Super Admin only)
app.get('/api/superadmin/admins', protect, superAdmin, async (req, res) => {
    try {
        const admins = await User.find({ role: 'admin' });
        res.json(admins);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Super Admin Stats
app.get('/api/superadmin/stats', protect, superAdmin, async (req, res) => {
    try {
        const totalPgs = await Pg.countDocuments();
        const totalAdmins = await User.countDocuments({ role: 'admin' });
        const totalUsers = await User.countDocuments({ role: 'user' });
        
        // Calculate Total Revenue
        const revenueResult = await Booking.aggregate([
            { $match: { paymentStatus: 'Paid' } },
            { $group: { _id: null, total: { $sum: "$rentAmount" } } }
        ]);
        const totalRevenue = revenueResult[0] ? revenueResult[0].total : 0;

        res.json({
            totalPgs,
            totalAdmins,
            totalUsers,
            totalRevenue
        });
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
    const superAdminEmail = 'superadmin@gmail.com';

    const superAdminExists = await User.findOne({ email: superAdminEmail });
    if (!superAdminExists) {
      const superAdminUser = new User({
        id: `superadmin-${Date.now()}`,
        name: 'Super Admin',
        email: superAdminEmail,
        password: 'superadmin123', // In real app, hash this
        role: 'superadmin',
        phoneNumber: '0000000000'
      });
      await superAdminUser.save();
      console.log('Super Admin user created: superadmin@gmail.com / superadmin123');
    }

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
// --- File Upload Route with Optimization ---
app.post('/api/upload', protect, upload.single('file'), async (req, res) => {
  if (req.file) {
    try {
      // Check if it's an image
      if (req.file.mimetype.startsWith('image/')) {
        const filename = `optimized-${Date.now()}.webp`;
        const outputPath = path.join(uploadDir, filename);

        await sharp(req.file.path)
          .resize(800) // Resize to max width 800px
          .webp({ quality: 80 }) // Convert to WebP with 80% quality
          .toFile(outputPath);

        // Delete original file to save space
        fs.unlinkSync(req.file.path);

        res.json({ 
          message: 'File uploaded and optimized successfully', 
          filePath: `/uploads/${filename}` 
        });
      } else {
        // Non-image files (keep as is)
        res.json({ 
          message: 'File uploaded successfully', 
          filePath: `/uploads/${req.file.filename}` 
        });
      }
    } catch (error) {
      console.error('Image optimization failed:', error);
      // Fallback to original file if optimization fails
      res.json({ 
        message: 'File uploaded (optimization skipped)', 
        filePath: `/uploads/${req.file.filename}` 
      });
    }
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

app.post('/api/notices', protect, caretaker, async (req, res) => {
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

app.delete('/api/notices/:id', protect, caretaker, async (req, res) => {
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
      if (req.user.assignedPgId) {
        query = { pgId: req.user.assignedPgId };
      } else {
        query = { caretakerId: req.user.id };
      }
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

app.delete('/api/visitors/:id', protect, caretaker, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);
    if (visitor) {
      await visitor.deleteOne();
      res.json({ message: 'Visitor removed' });
    } else {
      res.status(404).json({ message: 'Visitor not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/visitors/clear-history', protect, caretaker, async (req, res) => {
  try {
    // Delete all visitors that have checked out (timeOut exists)
    // Filter by caretaker's scope
    let query = { timeOut: { $ne: null } };
    
    if (req.user.role === 'caretaker') {
        if (req.user.assignedPgId) {
            query.pgId = req.user.assignedPgId;
        } else {
            query.caretakerId = req.user.id;
        }
    }
    
    const result = await Visitor.deleteMany(query);
    res.json({ message: `Cleared ${result.deletedCount} visitor records` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// --- QR Code Entry Routes ---

// Generate QR Token (Resident)
app.get('/api/user/qr-token', protect, async (req, res) => {
  try {
    // Token valid for 5 minutes
    const qrToken = jwt.sign(
      { userId: req.user.id, pgId: req.user.assignedPgId, timestamp: Date.now() },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '5m' }
    );
    res.json({ token: qrToken });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Scan QR Token (Caretaker)
app.post('/api/gate/scan', protect, caretaker, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'Token is required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
    // Find user to get details
    const user = await User.findOne({ id: decoded.userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Determine entry/exit type based on last log
    const lastLog = await EntryLog.findOne({ userId: decoded.userId }).sort({ createdAt: -1 });
    const type = (lastLog && lastLog.type === 'Entry') ? 'Exit' : 'Entry';

    const entryLog = new EntryLog({
      userId: decoded.userId,
      pgId: decoded.pgId || user.assignedPgId || 'General',
      type: type,
      scannedBy: req.user.id
    });

    await entryLog.save();

    // Emit event for real-time updates if needed
    const io = req.app.get('io');
    io.emit('entryLogged', { log: entryLog, user: { name: user.name, roomNo: user.roomNo } });

    res.json({ 
      message: `${type} logged successfully`, 
      user: { name: user.name, photo: user.photo || null },
      type: type,
      time: new Date()
    });

  } catch (error) {
    console.error('Scan Error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ message: 'QR Code expired' });
    }
    // Return actual error message for debugging if it's not a JWT error
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: error.message });
    }
    res.status(400).json({ message: 'Invalid QR Code' });
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

app.post('/api/payments/remind', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'caretaker') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const { type, id, message } = req.body;
    let bookings = [];

    if (type === 'user') {
      bookings = await Booking.find({ userId: id, status: 'Confirmed' });
    } else if (type === 'room') {
      // Assuming 'room' means PG Listing
      bookings = await Booking.find({ pgId: id, status: 'Confirmed' });
    } else if (type === 'all') {
      bookings = await Booking.find({ status: 'Confirmed' });
    }

    const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);

    let remindersSent = 0;
    const io = req.app.get('io');

    for (const booking of bookings) {
      let payment = await Payment.findOne({ bookingId: booking._id, month });
      
      if (!payment) {
        // Create new payment
        payment = new Payment({
          userId: booking.userId,
          userName: booking.userName,
          bookingId: booking._id,
          pgId: booking.pgId,
          amount: booking.rentAmount,
          dueDate: dueDate,
          month: month,
          status: 'Pending',
          reminderMessage: message,
          lastReminded: new Date()
        });
        await payment.save();
        io.emit('paymentCreated', payment);
      } else {
        // Update existing payment with reminder
        payment.reminderMessage = message;
        payment.lastReminded = new Date();
        await payment.save();
        io.emit('paymentUpdated', payment);
      }
      
      // Also emit a specific reminder event for UI toast
      io.emit('paymentReminder', {
        userId: booking.userId,
        message: message || `Payment reminder for ${month}`,
        paymentId: payment._id,
        amount: payment.amount
      });
      
      remindersSent++;
    }

    res.json({ message: `Sent ${remindersSent} reminders` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update User Profile
app.put('/api/users/:id', protect, async (req, res) => {
  try {
    if (req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    const user = await User.findOne({ id: req.params.id });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Update allowed fields
    const allowedUpdates = ['name', 'phoneNumber', 'address', 'guardianName', 'guardianPhone', 'gender'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    // Special case for phone mapping if frontend sends 'phone' instead of 'phoneNumber'
    if (req.body.phone) user.phoneNumber = req.body.phone;
    
    await user.save();
    
    const { password: _, ...userWithoutPassword } = user.toObject();
    res.json(userWithoutPassword);
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
// Connect to MongoDB
console.log('Attempting to connect to MongoDB at:', process.env.MONGODB_URI ? 'URI from env' : 'Localhost fallback');

if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
  console.error('FATAL ERROR: MONGODB_URI is not defined in this environment.');
  process.exit(1);
}

const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tajpg', {
      serverSelectionTimeoutMS: 5000 // Fail faster if connection issues
    });
    console.log('Connected to MongoDB');
    
    // Run seed and recalculate tasks
    await seedUsers();
    await recalculateOccupancy();

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Could not connect to MongoDB:', err);
    process.exit(1);
  }
};

startServer();
