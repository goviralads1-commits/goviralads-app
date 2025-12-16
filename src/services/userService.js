const User = require('../models/User');

// User service for authentication-related lookups.
// Only implements read operations needed for Phase 1 login.

async function findUserByIdentifier(identifier) {
  if (!identifier) {
    return null;
  }

  const normalized = String(identifier).trim();

  if (!normalized) {
    return null;
  }

  const user = await User.findOne({ identifier: normalized }).exec();

  if (!user) {
    return null;
  }

  return {
    id: user._id.toString(),
    identifier: user.identifier,
    passwordHash: user.passwordHash,
    role: user.role,
    status: user.status,
  };
}

module.exports = {
  findUserByIdentifier,
};
