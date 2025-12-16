const express = require('express');

const { ROLES } = require('../config');
const { signAuthToken } = require('../services/jwtService');
const { verifyPassword } = require('../services/passwordService');
const { findUserByIdentifier } = require('../services/userService');

const router = express.Router();

// POST /auth/login
// - Accepts identifier and password.
// - Looks up user by identifier (persistence to be implemented).
// - Verifies password.
// - Issues JWT with id, role, identifier.

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};

  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier and password are required' });
  }

  let user;
  try {
    user = await findUserByIdentifier(identifier);
  } catch (err) {
    // Persistence not implemented or lookup failed in an unexpected way.
    return res.status(500).json({ error: 'Authentication service not available' });
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (!user.passwordHash || !user.role || !user.status) {
    return res.status(500).json({ error: 'User record is incomplete' });
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'User account is disabled' });
  }

  if (user.role !== ROLES.CLIENT && user.role !== ROLES.ADMIN) {
    return res.status(403).json({ error: 'User role is not permitted' });
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signAuthToken({
    id: user.id,
    role: user.role,
    identifier: user.identifier,
  });

  return res.status(200).json({ token });
});

module.exports = router;
