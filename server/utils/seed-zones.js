/**
 * SeedZones — Pre-remplir les zones de vitesse par defaut pour Abidjan
 *
 * Appele au demarrage du serveur. N'insere les zones que si aucune
 * n'existe encore pour l'entreprise donnee.
 */

const ZoneVitesse = require('../models/ZoneVitesse');

function generateId() {
  return 'ZV-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

const ZONES_ABIDJAN = [
  { nom: 'Autoroute du Nord (Abidjan-Yamoussoukro)', type: 'axe', vitesseMax: 110, lat: 5.3800, lng: -4.0200, rayon: 5000 },
  { nom: 'Autoroute Abidjan-Grand Bassam', type: 'axe', vitesseMax: 110, lat: 5.3100, lng: -3.9000, rayon: 4000 },
  { nom: 'Boulevard VGE', type: 'axe', vitesseMax: 80, lat: 5.3200, lng: -4.0100, rayon: 2000 },
  { nom: 'Boulevard de Marseille', type: 'axe', vitesseMax: 60, lat: 5.3150, lng: -3.9850, rayon: 1500 },
  { nom: 'Pont HB (Houphouet-Boigny)', type: 'axe', vitesseMax: 60, lat: 5.3180, lng: -4.0220, rayon: 800 },
  { nom: 'Pont De Gaulle', type: 'axe', vitesseMax: 60, lat: 5.3250, lng: -4.0150, rayon: 800 },
  { nom: 'Pont Felix Houphouet-Boigny (3eme pont)', type: 'axe', vitesseMax: 80, lat: 5.3050, lng: -4.0350, rayon: 1000 },
  { nom: 'Cocody centre', type: 'zone', vitesseMax: 50, lat: 5.3490, lng: -3.9940, rayon: 2000 },
  { nom: 'Plateau (centre-ville)', type: 'zone', vitesseMax: 50, lat: 5.3200, lng: -4.0170, rayon: 1500 },
  { nom: 'Yopougon centre', type: 'zone', vitesseMax: 50, lat: 5.3590, lng: -4.0750, rayon: 3000 },
  { nom: 'Marcory-Treichville', type: 'zone', vitesseMax: 50, lat: 5.3050, lng: -3.9950, rayon: 2000 },
  { nom: 'Abobo centre', type: 'zone', vitesseMax: 50, lat: 5.4180, lng: -4.0200, rayon: 2500 }
];

/**
 * Insere les zones de vitesse par defaut pour Abidjan
 * si aucune zone n'existe pour cette entreprise.
 *
 * @param {string|null} entrepriseId
 */
async function seedDefaultZones(entrepriseId) {
  try {
    const filter = entrepriseId ? { entrepriseId } : {};
    const count = await ZoneVitesse.countDocuments(filter);
    if (count > 0) {
      console.log(`[SeedZones] ${count} zone(s) existante(s) pour entreprise ${entrepriseId || '(global)'} — skip`);
      return;
    }

    const docs = ZONES_ABIDJAN.map(z => ({
      id: generateId(),
      entrepriseId: entrepriseId || null,
      nom: z.nom,
      type: z.type,
      vitesseMax: z.vitesseMax,
      tolerance: 5,
      coordinates: { lat: z.lat, lng: z.lng, rayon: z.rayon },
      polygone: [],
      actif: true,
      dateCreation: new Date().toISOString()
    }));

    await ZoneVitesse.insertMany(docs);
    console.log(`[SeedZones] ${docs.length} zones de vitesse inserees pour Abidjan (entreprise ${entrepriseId || '(global)'})`);
  } catch (err) {
    console.error('[SeedZones] Erreur:', err.message);
  }
}

module.exports = { seedDefaultZones };
