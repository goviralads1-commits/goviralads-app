const mongoose = require('mongoose');
const User = require('./User');
const { ROLES } = require('../config');
const { hashPassword } = require('../services/passwordService');

require('dotenv').config();

async function seedClientUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const identifier = 'client@example.com';
    const password = 'client123';

    const passwordHash = await hashPassword(password);

    // Check if client already exists
    const existing = await User.findOne({ identifier }).exec();
    
    if (existing) {
      // Update password
      existing.passwordHash = passwordHash;
      await existing.save();
      console.log('Client user password updated:', existing.identifier);
      process.exit(0);
    }

    const clientUser = await User.create({
      identifier,
      passwordHash,
      role: ROLES.CLIENT,
      status: 'ACTIVE',
    });

    console.log('Client user created successfully!');
    console.log('Identifier:', clientUser.identifier);
    console.log('Role:', clientUser.role);
    console.log('Password: client123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding client:', error);
    process.exit(1);
  }
}

seedClientUser();
