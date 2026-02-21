const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'missing_fields' });
    }

    // Find user by email (include passwordHash for verification)
    const user = await User.findOne({ email: email.toLowerCase() }).lean();

    if (!user) {
      return res.json({ success: false, error: 'user_not_found' });
    }

    if (user.statut !== 'actif') {
      return res.json({ success: false, error: 'account_disabled' });
    }

    // First login: no password set yet
    if (!user.passwordHash) {
      const { passwordHash, _id, __v, ...safeUser } = user;
      return res.json({ success: false, error: 'first_login', user: safeUser });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.json({ success: false, error: 'invalid_password' });
    }

    // Must change password
    if (user.mustChangePassword) {
      const { passwordHash, _id, __v, ...safeUser } = user;
      return res.json({ success: false, error: 'must_change_password', user: safeUser });
    }

    // Success: generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update last login
    await User.findOneAndUpdate({ id: user.id }, { dernierConnexion: new Date().toISOString() });

    // Remove sensitive fields
    const { passwordHash, _id, __v, ...safeUser } = user;

    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/set-password
router.post('/set-password', async (req, res, next) => {
  try {
    const { userId, password, temporary } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ error: 'Missing userId or password' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash with bcrypt
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, salt);

    const user = await User.findOneAndUpdate(
      { id: userId },
      {
        passwordHash: hash,
        mustChangePassword: temporary === true
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If setting password for first time, generate token for auto-login
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - Get current user info
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await User.findOne({ id: req.user.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.toJSON());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
