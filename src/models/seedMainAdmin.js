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
    throw new Error('MAIN_ADMIN_IDENTIFIER and MAIN_ADMIN_PASSWORD must be set for seeding');
  }

  // Check if a user with this identifier already exists.
  const existing = await User.findOne({ identifier }).exec();

  if (existing) {
    // If an existing user has this identifier but is not ADMIN, we treat it as a configuration error.
    if (existing.role !== ROLES.ADMIN) {
      throw new Error('Existing MAIN ADMIN identifier is not assigned ADMIN role');
    }

    return existing;
  }

  const passwordHash = await hashPassword(password);

  const mainAdmin = await User.create({
    identifier,
    passwordHash,
    role: ROLES.ADMIN,
    status: 'ACTIVE',
  });

  // No flag is stored for MAIN ADMIN beyond the identifier; privilege is derived
  // exclusively via MAIN_ADMIN_IDENTIFIER.

  return mainAdmin;
}

module.exports = {
  ensureMainAdminSeed,
};
