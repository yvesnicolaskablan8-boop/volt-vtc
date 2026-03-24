const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/data - Fetch ALL collections at once (for cache initialization)
router.get('/', async (req, res, next) => {
  try {
    // Load all models
    const Chauffeur = require('../models/Chauffeur');
    const Vehicule = require('../models/Vehicule');
    const Course = require('../models/Course');
    const Versement = require('../models/Versement');
    const Gps = require('../models/Gps');
    const Comptabilite = require('../models/Comptabilite');
    const Facture = require('../models/Facture');
    const Budget = require('../models/Budget');
    const Planning = require('../models/Planning');
    const Absence = require('../models/Absence');
    const User = require('../models/User');
    const Settings = require('../models/Settings');
    const Signalement = require('../models/Signalement');
    const Pointage = require('../models/Pointage');
    const ConduiteBrute = require('../models/ConduiteBrute');
    const ChecklistVehicule = require('../models/ChecklistVehicule');
    const Contravention = require('../models/Contravention');
    const Depense = require('../models/Depense');
    const DepenseRecurrente = require('../models/DepenseRecurrente');
    const DepenseCategorie = require('../models/DepenseCategorie');
    const VersementRecurrent = require('../models/VersementRecurrent');
    const Reparation = require('../models/Reparation');
    const ControleTechnique = require('../models/ControleTechnique');
    const Incident = require('../models/Incident');
    const Tache = require('../models/Tache');
    const CompteRendu = require('../models/CompteRendu');
    const ZoneVitesse = require('../models/ZoneVitesse');
    const InfractionVitesse = require('../models/InfractionVitesse');

    // Tenant filter — scope all queries by entrepriseId if available
    const ef = req.user.entrepriseId ? { entrepriseId: req.user.entrepriseId } : {};

    // Fetch all collections in parallel, scoped by tenant
    const [
      chauffeurs, vehicules, courses, versements,
      gps, comptabilite, factures, budgets,
      planning, absences, users, settingsDoc, signalements,
      pointages, conduiteBrute, checklistVehicules, contraventions, depenses,
      depenseRecurrentes, depenseCategories, versementRecurrents,
      reparations, controlesTechniques, incidents, taches, comptesRendus,
      zonesVitesse, infractionsVitesse
    ] = await Promise.all([
      Chauffeur.find(ef).lean(),
      Vehicule.find(ef).lean(),
      Course.find(ef).lean(),
      Versement.find(ef).lean(),
      Gps.find(ef).lean(),
      Comptabilite.find(ef).lean(),
      Facture.find(ef).lean(),
      Budget.find(ef).lean(),
      Planning.find(ef).lean(),
      Absence.find(ef).lean(),
      User.find(ef).lean(),
      Settings.findOne(ef).lean(),
      Signalement.find(ef).lean(),
      Pointage.find(ef).lean(),
      ConduiteBrute.find(ef).lean(),
      ChecklistVehicule.find(ef).lean(),
      Contravention.find(ef).lean(),
      Depense.find(ef).lean(),
      DepenseRecurrente.find(ef).lean(),
      DepenseCategorie.find(ef).lean(),
      VersementRecurrent.find(ef).lean(),
      Reparation.find(ef).lean(),
      ControleTechnique.find(ef).lean(),
      Incident.find(ef).lean(),
      Tache.find(ef).lean(),
      CompteRendu.find(ef).lean(),
      ZoneVitesse.find(ef).lean(),
      InfractionVitesse.find(ef).lean()
    ]);

    // Clean MongoDB fields (_id, __v) from all documents
    const clean = (docs) => docs.map(({ _id, __v, ...rest }) => rest);

    // Remove passwordHash from users
    const cleanUsers = users.map(({ _id, __v, passwordHash, ...rest }) => rest);

    // Clean settings
    const settings = settingsDoc
      ? (() => { const { _id, __v, ...rest } = settingsDoc; return rest; })()
      : { entreprise: {}, preferences: {} };

    res.json({
      chauffeurs: clean(chauffeurs),
      vehicules: clean(vehicules),
      courses: clean(courses),
      versements: clean(versements),
      gps: clean(gps),
      comptabilite: clean(comptabilite),
      factures: clean(factures),
      budgets: clean(budgets),
      planning: clean(planning),
      absences: clean(absences),
      users: cleanUsers,
      signalements: clean(signalements),
      pointages: clean(pointages),
      conduiteBrute: clean(conduiteBrute),
      checklistVehicules: clean(checklistVehicules),
      contraventions: clean(contraventions),
      depenses: clean(depenses),
      depenseRecurrentes: clean(depenseRecurrentes),
      depenseCategories: clean(depenseCategories),
      versementRecurrents: clean(versementRecurrents),
      reparations: clean(reparations),
      controlesTechniques: clean(controlesTechniques),
      incidents: clean(incidents),
      taches: clean(taches),
      comptesRendus: clean(comptesRendus),
      zonesVitesse: clean(zonesVitesse),
      infractionsVitesse: clean(infractionsVitesse),
      settings
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/data/fix-manquants — Recalculer le manquant pour tous les versements
router.post('/fix-manquants', async (req, res, next) => {
  try {
    const Versement = require('../models/Versement');
    const Chauffeur = require('../models/Chauffeur');
    const ef = req.user.entrepriseId ? { entrepriseId: req.user.entrepriseId } : {};

    const versements = await Versement.find(ef).lean();
    const chauffeurs = await Chauffeur.find(ef).lean();
    const chauffeurMap = {};
    chauffeurs.forEach(c => { chauffeurMap[c.id] = c; });

    let fixed = 0;
    for (const v of versements) {
      const ch = chauffeurMap[v.chauffeurId];
      if (!ch) continue;
      const redevance = ch.redevanceQuotidienne || 0;
      if (redevance <= 0) continue;

      const montant = v.montantVerse || v.montantNet || 0;
      if (montant <= 0) continue;

      const manquant = montant < redevance ? redevance - montant : 0;
      const traitementManquant = manquant > 0 ? 'dette' : null;
      const newStatut = (v.statut === 'supprime') ? v.statut
        : (montant >= redevance ? 'valide' : 'partiel');

      // Ne mettre a jour que si les valeurs ont change
      if (v.manquant !== manquant || v.traitementManquant !== traitementManquant || (v.statut !== newStatut && v.statut !== 'supprime')) {
        await Versement.updateOne({ id: v.id, ...(v.entrepriseId ? { entrepriseId: v.entrepriseId } : {}) }, {
          manquant,
          traitementManquant,
          statut: newStatut
        });
        fixed++;
      }
    }

    res.json({ message: `${fixed} versement(s) corrigé(s) sur ${versements.length} total`, fixed, total: versements.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
