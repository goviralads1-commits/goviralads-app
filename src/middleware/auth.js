const jwt = require('jsonwebtoken');

const { jwtConfig, ROLES } = require('../config');

// Minimal, explicit JWT authentication middleware.
// - Verifies JWT on incoming requests.
// - Attaches a normalized user object to req.user.
// - No database access, no business logic.

function extractTokenFromHeader(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

function authenticateJWT(req, res, next) {
  const token = extractTokenFromHeader(req);

  if (!token) {
    return res.status(401).json({ error: 'Authorization header missing or malformed' });
  }

  try {
    const payload = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm],
    });

    const { sub, role, identifier } = payload;

    if (!sub || !role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    if (role !== ROLES.CLIENT && role !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'Unsupported role in token' });
    }

    // Attach a minimal, normalized user context to the request.
    req.user = {
      id: sub,
      role,
      identifier: identifier || null,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  authenticateJWT,
};
