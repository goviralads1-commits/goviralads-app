const User = require('./User');
const { ROLES } = require('../config');
const bcrypt = require('bcryptjs');

// HARDCODED ADMIN CREDENTIALS - ALWAYS USED
const ADMIN_EMAIL = 'admin@goviralads.com';
const ADMIN_PASSWORD = 'Admin@12345';
const SALT_ROUNDS = 10;

// FORCE RESET admin password on every server start
async function ensureMainAdminSeed() {
  const identifier = ADMIN_EMAIL.trim().toLowerCase();
  
  console.log('========================================');
  console.log('[ADMIN SEED] FORCE RESET STARTING...');
  console.log('[ADMIN SEED] Target email:', identifier);
  console.log('[ADMIN SEED] Password to set:', ADMIN_PASSWORD);
  console.log('========================================');

  // Generate fresh bcrypt hash - ALWAYS
  console.log('[ADMIN SEED] Generating bcrypt hash (10 rounds)...');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  console.log('[ADMIN SEED] Hash generated:', passwordHash.substring(0, 20) + '...');

  // Find existing admin
  const existing = await User.findOne({ identifier }).exec();

  if (existing) {
    console.log('[ADMIN SEED] Admin user FOUND in database');
    console.log('[ADMIN SEED] Current hash:', existing.passwordHash?.substring(0, 20) + '...');
    console.log('[ADMIN SEED] OVERWRITING password hash NOW...');
    
    // FORCE UPDATE using direct assignment and save
    existing.passwordHash = passwordHash;
    existing.role = ROLES.ADMIN;
    existing.status = 'ACTIVE';
    
    const saved = await existing.save();
    
    console.log('[ADMIN SEED] Save completed');
    console.log('[ADMIN SEED] New hash after save:', saved.passwordHash?.substring(0, 20) + '...');
    console.log('========================================');
    console.log('ADMIN PASSWORD FORCE RESET SUCCESS');
    console.log('Email: admin@goviralads.com');
    console.log('Password: Admin@12345');
    console.log('========================================');
    return saved;
  }

  // Create new admin if not exists
  console.log('[ADMIN SEED] Admin NOT FOUND - creating new user...');
  const mainAdmin = await User.create({
    identifier,
    passwordHash,
    role: ROLES.ADMIN,
    status: 'ACTIVE',
  });

  console.log('[ADMIN SEED] Admin user CREATED');
  console.log('========================================');
  console.log('ADMIN USER CREATED SUCCESS');
  console.log('Email: admin@goviralads.com');
  console.log('Password: Admin@12345');
  console.log('========================================');
  return mainAdmin;
}

module.exports = {
  ensureMainAdminSeed,
};
