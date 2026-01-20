const express = require('express');
const User = require('../models/User');
const { verifyPassword } = require('../services/passwordService');
const { signAuthToken } = require('../services/jwtService');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    console.log('[LOGIN] Attempt for identifier:', identifier);
    console.log('[LOGIN] Request from:', req.get('user-agent'));
    console.log('[LOGIN] Origin:', req.get('origin'));

    if (!identifier || !password) {
      console.log('[LOGIN] Missing credentials');
      return res.status(400).json({ error: 'Identifier and password are required' });
    }

    // Trim whitespace and remove invisible characters
    const cleanIdentifier = identifier.trim().toLowerCase();
    const cleanPassword = password.trim();

    console.log('[LOGIN] Clean identifier:', cleanIdentifier);

    const user = await User.findOne({ identifier: cleanIdentifier }).exec();
    if (!user) {
      console.log('[LOGIN] User not found:', cleanIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('[LOGIN] User found - Role:', user.role, 'Status:', user.status);

    if (user.status !== 'ACTIVE') {
      console.log('[LOGIN] Account disabled');
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const isValidPassword = await verifyPassword(cleanPassword, user.passwordHash);
    console.log('[LOGIN] Password valid:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('[LOGIN] Invalid password for:', cleanIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signAuthToken(user);
    console.log('[LOGIN] Token generated for:', cleanIdentifier);
    console.log('[LOGIN] Success - sending response');
    
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
    console.error('[LOGIN] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;





