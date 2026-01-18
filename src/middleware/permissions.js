const checkPermission = (user, permission, level = 'FULL') => {
  // Admin role always has full access
  if (user.role === 'ADMIN' && !user.customRole) {
    return true;
  }
  
  // If user has custom role, check permissions
  if (user.customRole && user.customRole.permissions) {
    const userPermission = user.customRole.permissions[permission];
    
    if (!userPermission || userPermission === 'NONE') {
      return false;
    }
    
    if (level === 'PARTIAL' && (userPermission === 'PARTIAL' || userPermission === 'FULL')) {
      return true;
    }
    
    if (level === 'FULL' && userPermission === 'FULL') {
      return true;
    }
    
    return false;
  }
  
  // Default: no custom role = no permission (except ADMIN)
  return false;
};

const requirePermission = (permission, level = 'FULL') => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const User = require('../models/User');
      const user = await User.findById(userId).populate('customRole');
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      if (!checkPermission(user, permission, level)) {
        return res.status(403).json({ error: `Permission denied: ${permission} (${level} required)` });
      }
      
      next();
    } catch (err) {
      return res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

module.exports = {
  checkPermission,
  requirePermission
};
