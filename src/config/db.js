const mongoose = require('mongoose');

// MongoDB connection helper.
// Uses MONGODB_URI from environment and fails fast if missing.

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const mongoUri = getRequiredEnv('MONGODB_URI');

async function connectToDatabase() {
  await mongoose.connect(mongoUri, {
    // Keep options explicit for clarity; adjust as needed in production.
  });
}

module.exports = {
  connectToDatabase,
};
