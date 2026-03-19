const User = require('../models/User');

// ALL_PERMISSIONS — used for main admin shortcut
const ALL_PERMISSIONS = {
  canViewWallet: true,
  canApproveRecharge: true,
  canEditPlans: true,
  canCreateTasks: true,
  canEditTasks: true,
  canDeleteTasks: true,
  canViewAllTasks: true,
  canAssignTasks: true,
  canAddUsers: true,
  canEditUsers: true,
};

// Synchronous helper — call only when user.customRole is already populated
const checkPermission = (user, permission) => {
  // Main admin (ADMIN role with no customRole) always passes
  if (user.role === 'ADMIN' && !user.customRole) return true;
  // Sub-admin: check boolean flag on populated customRole
  if (user.customRole && user.customRole.permissions) {
    return user.customRole.permissions[permission] === true;
  }
  return false;
};

// Express middleware factory
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const user = await User.findById(userId).populate('customRole');
      if (!user) return res.status(401).json({ error: 'User not found' });

      if (!checkPermission(user, permission)) {
        return res.status(403).json({ error: `Permission denied: ${permission}` });
      }
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

module.exports = {
  checkPermission,
  requirePermission,
  ALL_PERMISSIONS,
};
