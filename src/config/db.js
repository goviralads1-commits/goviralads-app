const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/goviralads';

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.error('✗ MONGODB_URI environment variable is not set');
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ MongoDB connected');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error.message);
    console.error('✗ Connection string preview:', MONGODB_URI.substring(0, 30) + '...');
    process.exit(1);
  }
}

module.exports = {
  connectDB,
};





