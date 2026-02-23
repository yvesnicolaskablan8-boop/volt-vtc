const express = require('express');
const authMiddleware = require('../middleware/auth');
const Chauffeur = require('../models/Chauffeur');
const Vehicule = require('../models/Vehicule');

const router = express.Router();
router.use(authMiddleware);

// GET /api/gps/positions — Positions temps reel de tous les chauffeurs actifs
router.get('/positions', async (req, res, next) => {
  try {
    const chauffeurs = await Chauffeur.find({
      statut: 'actif',
      'location.lat': { $exists: true, $ne: null }
    }).lean();

    // Enrichir avec info vehicule
    const vehiculeIds = chauffeurs
      .map(c => c.vehiculeAssigne)
      .filter(Boolean);
    const vehicules = vehiculeIds.length > 0
      ? await Vehicule.find({ id: { $in: vehiculeIds } }).lean()
      : [];
    const vehiculeMap = {};
    vehicules.forEach(v => { vehiculeMap[v.id] = v; });

    const positions = chauffeurs.map(c => {
      const v = c.vehiculeAssigne ? vehiculeMap[c.vehiculeAssigne] : null;
      return {
        chauffeurId: c.id,
        prenom: c.prenom,
        nom: c.nom,
        telephone: c.telephone,
        lat: c.location.lat,
        lng: c.location.lng,
        speed: c.location.speed,
        heading: c.location.heading,
        updatedAt: c.location.updatedAt,
        vehicule: v ? `${v.marque} ${v.modele} (${v.immatriculation})` : null
      };
    });

    res.json(positions);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
