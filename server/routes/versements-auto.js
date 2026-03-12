const express = require('express');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

/**
 * POST /api/versements/auto-generate
 * Génère automatiquement les versements en_attente pour chaque chauffeur planifié
 * sur une date donnée (ou aujourd'hui par défaut).
 * Skip si un versement existe déjà pour ce chauffeur à cette date.
 */
router.post('/auto-generate', async (req, res, next) => {
  try {
    const Planning = require('../models/Planning');
    const Chauffeur = require('../models/Chauffeur');
    const Versement = require('../models/Versement');
    const Absence = require('../models/Absence');

    const date = req.body.date || new Date().toISOString().split('T')[0];

    // 1. Trouver tous les chauffeurs planifiés ce jour
    const plannings = await Planning.find({ date }).lean();
    if (plannings.length === 0) {
      return res.json({ created: 0, skipped: 0, message: 'Aucun chauffeur planifié ce jour' });
    }

    // 2. Dédupliquer par chauffeurId (un seul versement par chauffeur/jour)
    const chauffeurIds = [...new Set(plannings.map(p => p.chauffeurId))];

    // 3. Récupérer les chauffeurs actifs avec redevance
    const chauffeurs = await Chauffeur.find({
      id: { $in: chauffeurIds },
      statut: { $ne: 'inactif' }
    }).lean();

    // 4. Vérifier les absences
    const absences = await Absence.find({
      chauffeurId: { $in: chauffeurIds },
      dateDebut: { $lte: date },
      dateFin: { $gte: date }
    }).lean();
    const absentIds = new Set(absences.map(a => a.chauffeurId));

    // 5. Vérifier les versements existants pour cette date
    const existingVersements = await Versement.find({
      chauffeurId: { $in: chauffeurIds },
      date
    }).lean();
    const existingMap = new Set(existingVersements.map(v => v.chauffeurId));

    // 6. Créer les versements manquants
    let created = 0;
    let skipped = 0;
    const newVersements = [];

    for (const ch of chauffeurs) {
      // Skip si absent
      if (absentIds.has(ch.id)) { skipped++; continue; }
      // Skip si versement existe déjà
      if (existingMap.has(ch.id)) { skipped++; continue; }
      // Skip si pas de redevance
      const redevance = ch.redevanceQuotidienne || 0;
      if (redevance <= 0) { skipped++; continue; }

      const id = 'VRS-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      newVersements.push({
        id,
        chauffeurId: ch.id,
        vehiculeId: ch.vehiculeAssigne || '',
        date,
        periode: '',
        montantBrut: redevance,
        commission: 0,
        montantNet: redevance,
        montantVerse: 0, // Pas encore payé
        statut: 'en_attente',
        nombreCourses: 0,
        commentaire: 'Auto-généré depuis le planning',
        soumisParChauffeur: false,
        enRetard: false,
        penaliteMontant: 0,
        dateCreation: new Date().toISOString()
      });
      created++;
    }

    if (newVersements.length > 0) {
      await Versement.insertMany(newVersements);
    }

    res.json({
      created,
      skipped,
      date,
      message: `${created} versement(s) créé(s), ${skipped} ignoré(s)`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/versements/cleanup-ghosts
 * Supprime les versements fantômes :
 * - montantVerse === 0 ET statut !== 'en_attente' (pas de wave en cours)
 * - OU statut === 'en_attente' sans waveCheckoutId (pas de paiement Wave en cours)
 */
router.post('/cleanup-ghosts', async (req, res, next) => {
  try {
    const Versement = require('../models/Versement');

    // Supprimer les versements "validés" à 0 FCFA (fantômes de la grille récurrente)
    const result1 = await Versement.deleteMany({
      montantVerse: 0,
      statut: { $in: ['valide', 'partiel', 'retard'] }
    });

    // Supprimer les versements en_attente sans waveCheckoutId (pas de paiement en cours)
    const result2 = await Versement.deleteMany({
      statut: 'en_attente',
      montantVerse: 0,
      $or: [
        { waveCheckoutId: { $exists: false } },
        { waveCheckoutId: null },
        { waveCheckoutId: '' }
      ]
    });

    const total = (result1.deletedCount || 0) + (result2.deletedCount || 0);
    console.log(`[Cleanup] ${total} versements fantômes supprimés (${result1.deletedCount} validés à 0, ${result2.deletedCount} en_attente sans Wave)`);

    res.json({
      deleted: total,
      details: {
        validesA0: result1.deletedCount || 0,
        enAttenteOrphelins: result2.deletedCount || 0
      },
      message: `${total} versement(s) fantôme(s) supprimé(s)`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
