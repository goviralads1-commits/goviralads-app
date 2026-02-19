const express = require('express');
const User = require('../models/User');
const { verifyPassword } = require('../services/passwordService');
const { signAuthToken } = require('../services/jwtService');

const router = express.Router();

router.post('/login', async (req, res) => {
  console.log('==================== LOGIN HIT ====================');
  console.log('[LOGIN] Request received at:', new Date().toISOString());
  try {
    const { identifier, password } = req.body;

    console.log('[LOGIN] ========== NEW LOGIN ATTEMPT ==========');
    console.log('[LOGIN] Raw email received:', identifier ? 'YES' : 'NO');
    console.log('[LOGIN] Raw password received:', password ? 'YES' : 'NO');
    console.log('[LOGIN] Password length:', password ? password.length : 0);
    console.log('[LOGIN] Request from:', req.get('user-agent'));
    console.log('[LOGIN] Origin:', req.get('origin'));
    console.log('[LOGIN] IP:', req.ip || req.connection.remoteAddress);

    if (!identifier || !password) {
      console.log('[LOGIN] ❌ Missing credentials');
      return res.status(400).json({ error: 'Identifier and password are required' });
    }

    // Trim whitespace and remove invisible characters
    const cleanIdentifier = identifier.trim().toLowerCase();
    const cleanPassword = password.trim();

    console.log('[LOGIN] Trimmed email:', cleanIdentifier);
    console.log('[LOGIN] Trimmed password length:', cleanPassword.length);

    const user = await User.findOne({ identifier: cleanIdentifier }).exec();
    if (!user) {
      console.log('[LOGIN] ❌ User not found:', cleanIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('[LOGIN] ✓ User found - Role:', user.role, 'Status:', user.status);

    if (user.status !== 'ACTIVE') {
      console.log('[LOGIN] ❌ Account disabled');
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const isValidPassword = await verifyPassword(cleanPassword, user.passwordHash);
    console.log('[LOGIN] bcrypt verification result:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('[LOGIN] ❌ Password mismatch for:', cleanIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signAuthToken(user);
    console.log('[LOGIN] ✓ JWT token generated');
    console.log('[LOGIN] ✓ Token length:', token ? token.length : 0);
    console.log('[LOGIN] ✓✓✓ SUCCESS - Sending response');
    console.log('[LOGIN] ==========================================');
    
    res.status(200).json({ 
      token, 
      user: { 
        id: user._id, 
        identifier: user.identifier, 
        role: user.role, 
        status: user.status 
      } 
    });
  } catch (error) {
    console.error('[LOGIN] ❌❌❌ EXCEPTION:', error.message);
    console.error('[LOGIN] Stack:', error.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;





