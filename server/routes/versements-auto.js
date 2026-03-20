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
    const ef = req.user.entrepriseId ? { entrepriseId: req.user.entrepriseId } : {};

    // 1. Trouver tous les chauffeurs planifiés ce jour (scoped by tenant)
    const plannings = await Planning.find({ ...ef, date }).lean();
    if (plannings.length === 0) {
      return res.json({ created: 0, skipped: 0, message: 'Aucun chauffeur planifié ce jour' });
    }

    // 2. Dédupliquer par chauffeurId (un seul versement par chauffeur/jour)
    const chauffeurIds = [...new Set(plannings.map(p => p.chauffeurId))];

    // 3. Récupérer les chauffeurs actifs avec redevance (scoped by tenant)
    const chauffeurs = await Chauffeur.find({
      ...ef,
      id: { $in: chauffeurIds },
      statut: { $ne: 'inactif' }
    }).lean();

    // 4. Vérifier les absences (scoped by tenant)
    const absences = await Absence.find({
      ...ef,
      chauffeurId: { $in: chauffeurIds },
      dateDebut: { $lte: date },
      dateFin: { $gte: date }
    }).lean();
    const absentIds = new Set(absences.map(a => a.chauffeurId));

    // 5. Vérifier les versements existants pour cette date (scoped by tenant)
    const existingVersements = await Versement.find({
      ...ef,
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
        ...(req.user.entrepriseId ? { entrepriseId: req.user.entrepriseId } : {}),
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
 * Supprime les versements fantômes (auto-générés sans paiement réel) :
 * 1. montantVerse === 0 avec statut validé/partiel/retard
 * 2. en_attente sans waveCheckoutId
 * 3. Auto-générés (commentaire "Auto:") sans moyen de paiement
 */
router.post('/cleanup-ghosts', async (req, res, next) => {
  try {
    const Versement = require('../models/Versement');
    const ef = req.user.entrepriseId ? { entrepriseId: req.user.entrepriseId } : {};

    // 1. Versements "validés" à 0 FCFA (scoped by tenant)
    const result1 = await Versement.deleteMany({
      ...ef,
      montantVerse: 0,
      statut: { $in: ['valide', 'partiel', 'retard'] }
    });

    // 2. Versements en_attente sans Wave (pas de paiement en cours) (scoped by tenant)
    const result2 = await Versement.deleteMany({
      ...ef,
      statut: 'en_attente',
      montantVerse: 0,
      $or: [
        { waveCheckoutId: { $exists: false } },
        { waveCheckoutId: null },
        { waveCheckoutId: '' }
      ]
    });

    // 3. Versements auto-générés SANS moyen de paiement (scoped by tenant)
    const result3 = await Versement.deleteMany({
      ...ef,
      commentaire: { $regex: /^Auto[:\-]/ },
      $or: [
        { moyenPaiement: { $exists: false } },
        { moyenPaiement: null },
        { moyenPaiement: '' }
      ]
    });

    const total = (result1.deletedCount || 0) + (result2.deletedCount || 0) + (result3.deletedCount || 0);
    console.log(`[Cleanup] ${total} versements fantômes supprimés (${result1.deletedCount} à 0 FCFA, ${result2.deletedCount} en_attente orphelins, ${result3.deletedCount} auto-générés sans paiement)`);

    res.json({
      deleted: total,
      details: {
        validesA0: result1.deletedCount || 0,
        enAttenteOrphelins: result2.deletedCount || 0,
        autoGeneresSansPaiement: result3.deletedCount || 0
      },
      message: `${total} versement(s) fantôme(s) supprimé(s)`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
