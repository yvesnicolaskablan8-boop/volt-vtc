const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { generateMonthlyReport } = require('../utils/pdf-generator');

// GET /api/rapports/chauffeur/:chauffeurId?mois=YYYY-MM
// Endpoint admin — genere un releve mensuel PDF pour un chauffeur
router.get('/chauffeur/:chauffeurId', authMiddleware, async (req, res, next) => {
  try {
    const { chauffeurId } = req.params;
    const mois = req.query.mois;
    if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
      return res.status(400).json({ error: 'Parametre mois requis au format YYYY-MM' });
    }
    const entrepriseId = req.user.entrepriseId || null;
    const buffer = await generateMonthlyReport(chauffeurId, mois, entrepriseId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="releve-${chauffeurId}-${mois}.pdf"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

module.exports = router;
