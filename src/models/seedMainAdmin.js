const User = require('./User');
const { ROLES } = require('../config');
const { hashPassword } = require('../services/passwordService');

// HARDCODED FALLBACK ADMIN CREDENTIALS
// Used if env vars are not set
const FALLBACK_ADMIN_EMAIL = 'admin@goviralads.com';
const FALLBACK_ADMIN_PASSWORD = 'Admin@12345';

// Ensures that the MAIN ADMIN user exists.
// Always creates or resets admin on every server start.

async function ensureMainAdminSeed() {
  // Use env vars if set, otherwise use hardcoded fallback
  const identifier = (process.env.MAIN_ADMIN_IDENTIFIER || FALLBACK_ADMIN_EMAIL).trim().toLowerCase();
  const password = process.env.MAIN_ADMIN_PASSWORD || FALLBACK_ADMIN_PASSWORD;

  console.log('🔧 [ADMIN SEED] Starting admin credential sync...');
  console.log('🔧 [ADMIN SEED] Target identifier:', identifier);
  console.log('🔧 [ADMIN SEED] Using env password:', process.env.MAIN_ADMIN_PASSWORD ? 'YES' : 'NO (fallback)');

  // Always generate fresh bcrypt hash
  const passwordHash = await hashPassword(password);
  console.log('✓ [ADMIN SEED] Password hash generated (bcrypt, 10 rounds)');

  // Check if admin user exists
  const existing = await User.findOne({ identifier }).exec();

  if (existing) {
    console.log('✓ [ADMIN SEED] Admin user found - FORCING password reset');
    
    // FORCE password update
    existing.passwordHash = passwordHash;
    existing.role = ROLES.ADMIN;
    existing.status = 'ACTIVE';
    await existing.save();
    
    console.log('✅ [ADMIN SEED] Admin password RESET complete');
    console.log('✅ [ADMIN SEED] Credentials synced successfully');
    return existing;
  }

  // Create new admin
  console.log('🔧 [ADMIN SEED] Admin not found - creating new');
  const mainAdmin = await User.create({
    identifier,
    passwordHash,
    role: ROLES.ADMIN,
    status: 'ACTIVE',
  });

  console.log('✅ [ADMIN SEED] Admin user CREATED');
  console.log('✅ [ADMIN SEED] Email:', identifier);
  console.log('✅ [ADMIN SEED] Credentials synced successfully');
  return mainAdmin;
}

module.exports = {
  ensureMainAdminSeed,
};
