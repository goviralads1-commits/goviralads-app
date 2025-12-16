// Aggregated config exports for auth-related concerns.

const { ROLES, isClientRole, isAdminRole } = require('./roles');
const { jwtConfig, mainAdminIdentifier, isMainAdminIdentifier } = require('./jwt');

module.exports = {
  ROLES,
  isClientRole,
  isAdminRole,
  jwtConfig,
  mainAdminIdentifier,
  isMainAdminIdentifier,
};
