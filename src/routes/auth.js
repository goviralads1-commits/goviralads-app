const express = require('express');
const User = require('../models/User');
const { verifyPassword } = require('../services/passwordService');
const { signAuthToken } = require('../services/jwtService');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required' });
    }

    const user = await User.findOne({ identifier }).exec();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signAuthToken(user);
    res.json({ token, user: { id: user._id, identifier: user.identifier, role: user.role, status: user.status } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;





