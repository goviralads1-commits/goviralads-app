const User = require('./User');
const { ROLES, mainAdminIdentifier } = require('../config');
const { hashPassword } = require('../services/passwordService');

function preserveExisting(user) {
  if (user.role !== ROLES.ADMIN) {
    throw new Error('ADMIN_BOOTSTRAP_IDENTITY_CONFLICT: existing account will not be modified');
  }
  console.log('[ADMIN SEED] Existing admin preserved');
  return user;
}

async function ensureMainAdminSeed() {
  const identifier = mainAdminIdentifier.trim().toLowerCase();
  let existing;
  try {
    existing = await User.findOne({ identifier }).exec();
  } catch (_) {
    throw new Error('ADMIN_BOOTSTRAP_LOOKUP_FAILED: unable to verify the existing account');
  }
  if (existing) return preserveExisting(existing);

  const configuredIdentifier = process.env.MAIN_ADMIN_IDENTIFIER;
  const password = process.env.MAIN_ADMIN_PASSWORD;
  if (!configuredIdentifier || configuredIdentifier !== identifier || !password) {
    throw new Error('ADMIN_BOOTSTRAP_CONFIG_REQUIRED: missing admin requires explicit MAIN_ADMIN_IDENTIFIER and MAIN_ADMIN_PASSWORD');
  }
  const bytes = Buffer.byteLength(password, 'utf8');
  if (bytes < 16 || bytes > 72 || password !== password.trim()) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD_INVALID: use 16-72 UTF-8 bytes without surrounding whitespace');
  }

  try {
    const passwordHash = await hashPassword(password);
    const admin = await User.create({ identifier, passwordHash, role: ROLES.ADMIN, status: 'ACTIVE' });
    console.log('[ADMIN SEED] Missing admin created from explicit bootstrap configuration');
    return admin;
  } catch (err) {
    if (err.code === 11000) {
      try {
        const concurrent = await User.findOne({ identifier }).exec();
        if (concurrent) return preserveExisting(concurrent);
      } catch (_) {
        // Do not expose database error details or credential-bearing values.
      }
    }
    throw new Error('ADMIN_BOOTSTRAP_CREATE_FAILED: no existing authentication state was overwritten');
  }
}

module.exports = { ensureMainAdminSeed };
