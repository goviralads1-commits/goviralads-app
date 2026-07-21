const express = require('express');
const User = require('../models/User');
const { verifyPassword, hashPassword } = require('../services/passwordService');
const { signAuthToken } = require('../services/jwtService');

const router = express.Router();

// POST /auth/register - Public client self-registration
router.post('/register', async (req, res) => {
  try {
    const { name, company, email, phone, password } = req.body || {};

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists
    const existingUser = await User.findOne({ identifier: cleanEmail, isDeleted: { $ne: true } });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Create user with PENDING_APPROVAL status
    const passwordHash = await hashPassword(password);
    const user = await User.create({
      identifier: cleanEmail,
      passwordHash,
      role: 'CLIENT',
      status: 'PENDING_APPROVAL',
      profile: {
        name: name.trim(),
        phone: phone?.trim() || '',
        company: company?.trim() || '',
      },
    });

    console.log(`[REGISTER] New client registration: ${cleanEmail} (ID: ${user._id})`);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Your account is awaiting admin approval.',
      userId: user._id,
    });
  } catch (err) {
    console.error('[REGISTER] Error:', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

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

    const user = await User.findOne({ 
      identifier: cleanIdentifier,
      isDeleted: { $ne: true }  // Exclude soft-deleted users
    }).exec();
    if (!user) {
      console.log('[LOGIN] ❌ User not found:', cleanIdentifier);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('[LOGIN] ✓ User found - Role:', user.role, 'Status:', user.status);

    if (user.status === 'PENDING_APPROVAL') {
      console.log('[LOGIN] ❌ Account pending approval');
      return res.status(403).json({ error: 'Your account is awaiting admin approval.', pendingApproval: true });
    }

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





