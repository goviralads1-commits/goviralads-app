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

  // Check if a user with this identifier already exists.
  const existing = await User.findOne({ identifier }).exec();

  if (existing) {
    console.log('✓ Admin user already exists:', identifier);
    
    // Update password hash if it's plain text or doesn't match bcrypt format
    if (!existing.passwordHash || !existing.passwordHash.startsWith('$2')) {
      console.log('⚠️ Fixing admin password hash...');
      existing.passwordHash = await hashPassword(password);
      await existing.save();
      console.log('✓ Admin password hash fixed');
    }
    
    // Ensure role is ADMIN
    if (existing.role !== ROLES.ADMIN) {
      existing.role = ROLES.ADMIN;
      await existing.save();
      console.log('✓ Admin role corrected');
    }
    
    // Ensure status is ACTIVE
    if (existing.status !== 'ACTIVE') {
      existing.status = 'ACTIVE';
      await existing.save();
      console.log('✓ Admin status set to ACTIVE');
    }

    return existing;
  }

  const passwordHash = await hashPassword(password);
  console.log('Creating new admin user:', identifier);

  const mainAdmin = await User.create({
    identifier,
    passwordHash,
    role: ROLES.ADMIN,
    status: 'ACTIVE',
  });

  console.log('✓ Admin user created successfully');
  return mainAdmin;
}

module.exports = {
  ensureMainAdminSeed,
};
