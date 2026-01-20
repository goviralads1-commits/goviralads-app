const User = require('./User');
const { ROLES, isMainAdminIdentifier } = require('../config');
const { hashPassword } = require('../services/passwordService');

// Ensures that the MAIN ADMIN user exists.
// MAIN ADMIN is determined only by identifier (MAIN_ADMIN_IDENTIFIER env),
// not by mutable role changes.

async function ensureMainAdminSeed() {
  const identifier = process.env.MAIN_ADMIN_IDENTIFIER;
  const password = process.env.MAIN_ADMIN_PASSWORD;

  if (!identifier || !password) {
    console.error('⚠️ MAIN_ADMIN_IDENTIFIER or MAIN_ADMIN_PASSWORD not set - admin seed skipped');
    return null;
  }

  console.log('🔧 [ADMIN SEED] Starting admin credential sync...');
  console.log('🔧 [ADMIN SEED] Target identifier:', identifier);

  // Always generate fresh bcrypt hash from env password
  const passwordHash = await hashPassword(password);
  console.log('✓ [ADMIN SEED] Password hash generated');

  // Check if admin user exists
  const existing = await User.findOne({ identifier }).exec();

  if (existing) {
    console.log('✓ [ADMIN SEED] Admin user found - FORCING password reset');
    
    // FORCE password update from env
    existing.passwordHash = passwordHash;
    existing.role = ROLES.ADMIN;
    existing.status = 'ACTIVE';
    await existing.save();
    
    console.log('✅ [ADMIN SEED] Admin password RESET complete');
    console.log('✅ [ADMIN SEED] Credentials synced from env');
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
  console.log('✅ [ADMIN SEED] Credentials synced from env');
  return mainAdmin;
}

module.exports = {
  ensureMainAdminSeed,
};
