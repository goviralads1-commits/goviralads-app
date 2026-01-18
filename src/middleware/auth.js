const jwt = require('jsonwebtoken');
const { jwtConfig } = require('../config');
const User = require('../models/User');

async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm],
    });

    // Check if user is suspended or deleted
    const user = await User.findById(decoded.sub).select('status isDeleted').exec();
    if (!user || user.isDeleted) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }

    req.user = {
      id: decoded.sub,
      role: decoded.role,
      identifier: decoded.identifier,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  authenticateJWT,
};





