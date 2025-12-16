const jwt = require('jsonwebtoken');

const { jwtConfig } = require('../config');

// JWT issuing service for auth tokens.
// Payload includes: sub (user id), role, identifier.

function signAuthToken(user) {
  const payload = {
    sub: user.id,
    role: user.role,
    identifier: user.identifier,
  };

  return jwt.sign(payload, jwtConfig.secret, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.expiry,
  });
}

module.exports = {
  signAuthToken,
};
