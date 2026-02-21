const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chauffeur = require('../models/Chauffeur');
const driverAuth = require('../middleware/driverAuth');

const router = express.Router();

// POST /api/driver/auth/login — Login telephone + PIN
router.post('/login', async (req, res, next) => {
  try {
    const { telephone, pin } = req.body;

    if (!telephone || !pin) {
      return res.status(400).json({ success: false, error: 'Telephone et PIN requis' });
    }

    // Trouver le user chauffeur par telephone
    const user = await User.findOne({
      telephone: telephone,
      role: 'chauffeur'
    }).lean();

    if (!user) {
      return res.json({ success: false, error: 'Aucun compte chauffeur avec ce numero' });
    }

    if (user.statut !== 'actif') {
      return res.json({ success: false, error: 'Compte desactive' });
    }

    if (!user.pin) {
      return res.json({ success: false, error: 'PIN non defini. Contactez votre gestionnaire.' });
    }

    // Verifier le PIN
    const isValid = await bcrypt.compare(pin, user.pin);
    if (!isValid) {
      return res.json({ success: false, error: 'PIN incorrect' });
    }

    // Recuperer les infos du chauffeur lie
    const chauffeur = await Chauffeur.findOne({ id: user.chauffeurId }).lean();
    if (!chauffeur) {
      return res.json({ success: false, error: 'Profil chauffeur introuvable' });
    }

    // Generer le JWT
    const token = jwt.sign(
      {
        userId: user.id,
        chauffeurId: user.chauffeurId,
        telephone: user.telephone,
        role: 'chauffeur'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }  // 7 jours pour les chauffeurs (mobile)
    );

    // Mettre a jour la derniere connexion
    await User.findOneAndUpdate(
      { id: user.id },
      { dernierConnexion: new Date().toISOString() }
    );

    // Retourner le profil chauffeur (sans donnees sensibles)
    const { _id, __v, passwordHash, pin: _pin, ...safeUser } = user;

    res.json({
      success: true,
      token,
      user: safeUser,
      chauffeur: {
        id: chauffeur.id,
        prenom: chauffeur.prenom,
        nom: chauffeur.nom,
        telephone: chauffeur.telephone,
        email: chauffeur.email,
        statut: chauffeur.statut,
        vehiculeAssigne: chauffeur.vehiculeAssigne,
        scoreConduite: chauffeur.scoreConduite
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/driver/auth/set-pin — Definir/changer le PIN
router.post('/set-pin', async (req, res, next) => {
  try {
    const { userId, pin, chauffeurId } = req.body;

    if (!userId || !pin) {
      return res.status(400).json({ error: 'userId et pin requis' });
    }

    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ error: 'Le PIN doit contenir 4 a 6 chiffres' });
    }

    // Hasher le PIN
    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(pin, salt);

    const updateData = { pin: hashedPin };

    // Si chauffeurId est fourni, le lier aussi
    if (chauffeurId) {
      updateData.chauffeurId = chauffeurId;
      updateData.role = 'chauffeur';
    }

    const user = await User.findOneAndUpdate(
      { id: userId },
      { $set: updateData },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json({ success: true, message: 'PIN defini avec succes' });
  } catch (err) {
    next(err);
  }
});

// GET /api/driver/auth/me — Profil du chauffeur connecte
router.get('/me', driverAuth, async (req, res, next) => {
  try {
    const chauffeur = await Chauffeur.findOne({ id: req.user.chauffeurId }).lean();
    if (!chauffeur) {
      return res.status(404).json({ error: 'Profil chauffeur introuvable' });
    }

    const { _id, __v, ...safeChauffeur } = chauffeur;
    res.json(safeChauffeur);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
