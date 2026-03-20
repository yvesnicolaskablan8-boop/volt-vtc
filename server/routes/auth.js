const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Entreprise = require('../models/Entreprise');
const Settings = require('../models/Settings');
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
      // Generate a short-lived token for the set-password flow (15 min)
      const setupToken = jwt.sign(
        { userId: user.id, purpose: 'set-password' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.json({ success: false, error: 'first_login', user: safeUser, setupToken });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.json({ success: false, error: 'invalid_password' });
    }

    // Must change password
    if (user.mustChangePassword) {
      const { passwordHash, _id, __v, ...safeUser } = user;
      const setupToken = jwt.sign(
        { userId: user.id, purpose: 'set-password' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.json({ success: false, error: 'must_change_password', user: safeUser, setupToken });
    }

    // Success: generate JWT with entrepriseId
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        role: user.role,
        permissions: user.permissions,
        entrepriseId: user.entrepriseId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
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

// POST /api/auth/register - Create a new company + admin user
router.post('/register', async (req, res, next) => {
  try {
    const { entrepriseNom, prenom, nom, email, password, telephone } = req.body;

    if (!entrepriseNom || !prenom || !nom || !email || !password) {
      return res.status(400).json({ success: false, error: 'missing_fields', message: 'Tous les champs sont requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'weak_password', message: 'Le mot de passe doit contenir au moins 6 caractères' });
    }

    // Check if email already taken
    const existing = await User.findOne({ email: email.toLowerCase() }).lean();
    if (existing) {
      return res.json({ success: false, error: 'email_taken', message: 'Cet email est déjà utilisé' });
    }

    // Create the entreprise with unique slug
    let slug = entrepriseNom.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Ensure slug uniqueness
    const existingSlug = await Entreprise.findOne({ slug }).lean();
    if (existingSlug) {
      slug = slug + '-' + Date.now().toString(36);
    }
    const entreprise = new Entreprise({
      nom: entrepriseNom,
      slug,
      email: email.toLowerCase(),
      telephone: telephone || ''
    });
    await entreprise.save();

    // Create default settings for this entreprise
    await Settings.create({
      entrepriseId: entreprise.id,
      entreprise: {
        nom: entrepriseNom,
        slogan: '',
        email: email.toLowerCase(),
        telephone: telephone || '',
        adresse: '',
        siteWeb: '',
        numeroRegistre: '',
        devise: 'FCFA'
      },
      preferences: {
        themeDefaut: 'dark',
        langue: 'fr',
        formatDate: 'DD/MM/YYYY',
        notifications: true,
        alertesSonores: false,
        sessionTimeout: 30
      }
    });

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // All permissions enabled for the admin
    const allPermissions = {
      dashboard: true, chauffeurs: true, vehicules: true, planning: true,
      versements: true, contraventions: true, depenses: true, rentabilite: true,
      comptabilite: true, garage: true, gps_conduite: true, alertes: true,
      rapports: true, parametres: true
    };

    // Create admin user
    const crypto = require('crypto');
    const user = new User({
      id: crypto.randomUUID(),
      entrepriseId: entreprise.id,
      prenom,
      nom,
      email: email.toLowerCase(),
      telephone: telephone || '',
      role: 'Administrateur',
      permissions: allPermissions,
      statut: 'actif',
      passwordHash
    });
    await user.save();

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        prenom: user.prenom,
        nom: user.nom,
        role: user.role,
        permissions: user.permissions,
        entrepriseId: entreprise.id
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    const { passwordHash: _, _id, __v, ...safeUser } = user.toJSON();

    res.status(201).json({
      success: true,
      token,
      user: safeUser,
      entreprise: entreprise.toJSON()
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/set-password
// Requires either: a valid JWT (logged-in user) or a short-lived setupToken from first_login flow
router.post('/set-password', async (req, res, next) => {
  try {
    const { userId, password, temporary, setupToken } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ error: 'Missing userId or password' });
    }

    // Auth check: either valid JWT or valid setupToken
    const authHeader = req.headers.authorization;
    let authenticated = false;

    // Option 1: Valid JWT (logged-in user changing password)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        // User can only change their own password (or admin can change any)
        if (decoded.userId === userId || decoded.role === 'Administrateur') {
          authenticated = true;
        }
      } catch (e) { /* token invalid, try setupToken */ }
    }

    // Option 2: Valid setupToken (first-login or must-change-password flow)
    if (!authenticated && setupToken) {
      try {
        const decoded = jwt.verify(setupToken, process.env.JWT_SECRET);
        if (decoded.purpose === 'set-password' && decoded.userId === userId) {
          authenticated = true;
        }
      } catch (e) { /* invalid setup token */ }
    }

    if (!authenticated) {
      return res.status(401).json({ error: 'Authentication required' });
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
        prenom: user.prenom,
        nom: user.nom,
        role: user.role,
        permissions: user.permissions,
        entrepriseId: user.entrepriseId || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
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
