const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/goviralads';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  connectDB,
};





