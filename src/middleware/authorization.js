// Role and main-admin guards.
// These middlewares assume authenticateJWT has already run
// and populated req.user with { id, role, identifier }.

const { ROLES, isClientRole, isAdminRole, isMainAdminIdentifier } = require('../config');

function ensureAuthenticated(req, res, next) {
  if (!req.user || !req.user.id || !req.user.role) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}

function requireClient(req, res, next) {
  if (!req.user || !isClientRole(req.user.role)) {
    return res.status(403).json({ error: 'CLIENT role required' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ error: 'ADMIN role required' });
  }
  return next();
}

function requireMainAdmin(req, res, next) {
  if (!req.user || !isAdminRole(req.user.role)) {
    return res.status(403).json({ error: 'MAIN ADMIN required' });
  }

  const identifier = req.user.identifier;

  if (!identifier || !isMainAdminIdentifier(identifier)) {
    return res.status(403).json({ error: 'MAIN ADMIN required' });
  }

  return next();
}

module.exports = {
  ensureAuthenticated,
  requireClient,
  requireAdmin,
  requireMainAdmin,
};
