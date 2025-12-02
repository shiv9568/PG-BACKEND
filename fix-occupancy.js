const mongoose = require('mongoose');
const Pg = require('./models/Pg');
const Booking = require('./models/Booking');
require('dotenv').config();

const fixOccupancy = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/tajpg');
    console.log('Connected.');

    const pgs = await Pg.find();
    console.log(`Found ${pgs.length} PGs. Checking occupancy...`);

    for (const pg of pgs) {
      const confirmedBookings = await Booking.countDocuments({ 
        pgId: pg.id, 
        status: 'Confirmed' 
      });

      console.log(`PG ${pg.name} (${pg.id}):`);
      console.log(`  Current occupiedBeds: ${pg.occupiedBeds}`);
      console.log(`  Actual Confirmed Bookings: ${confirmedBookings}`);

      if (pg.occupiedBeds !== confirmedBookings) {
        console.log(`  MISMATCH! Updating to ${confirmedBookings}...`);
        pg.occupiedBeds = confirmedBookings;
        await pg.save();
        console.log('  Updated.');
      } else {
        console.log('  Occupancy is correct.');
      }
    }

    console.log('Done.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

fixOccupancy();
