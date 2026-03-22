/**
 * SpeedCheck — Detection automatique des exces de vitesse
 *
 * Verifie si un point GPS se trouve dans une zone de vitesse limitee
 * et cree une infraction si le chauffeur depasse la limite.
 */

const ZoneVitesse = require('../models/ZoneVitesse');
const InfractionVitesse = require('../models/InfractionVitesse');
const Chauffeur = require('../models/Chauffeur');
const { haversineDistance } = require('./behavior-utils');

/**
 * Bareme des amendes par categorie (Cote d'Ivoire)
 */
const AMENDES = {
  1: 2000,   // +1 a 5 km/h
  2: 3000,   // +6 a 10 km/h
  3: 5000,   // +11 a 20 km/h
  4: 10000   // au-dela de +20 km/h
};

/**
 * Determine la categorie d'infraction selon le depassement
 */
function getCategorie(depassement) {
  if (depassement <= 5) return 1;
  if (depassement <= 10) return 2;
  if (depassement <= 20) return 3;
  return 4;
}

function generateId() {
  return 'INF-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

/**
 * Verifie si un point (lat, lng) est dans le rayon d'une zone point/radar/axe
 */
function isInPointZone(lat, lng, zone) {
  if (!zone.coordinates || !zone.coordinates.lat || !zone.coordinates.lng) return false;
  const distKm = haversineDistance(lat, lng, zone.coordinates.lat, zone.coordinates.lng);
  const rayonKm = (zone.coordinates.rayon || 200) / 1000;
  return distKm <= rayonKm;
}

/**
 * Verifie si un point est dans un polygone (ray casting)
 */
function isInPolygone(lat, lng, polygone) {
  if (!polygone || polygone.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
    const xi = polygone[i].lat, yi = polygone[i].lng;
    const xj = polygone[j].lat, yj = polygone[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Verifie si le chauffeur est en exces de vitesse dans une zone
 * et cree une infraction si necessaire.
 *
 * @param {string} chauffeurId
 * @param {number} lat
 * @param {number} lng
 * @param {number} speed - vitesse en km/h
 * @param {string} entrepriseId
 * @returns {Object|null} infraction creee ou null
 */
async function checkSpeedViolation(chauffeurId, lat, lng, speed, entrepriseId) {
  if (!speed || speed <= 0) return null;

  // Recuperer toutes les zones actives de l'entreprise
  const filter = { actif: true };
  if (entrepriseId) filter.entrepriseId = entrepriseId;
  const zones = await ZoneVitesse.find(filter).lean();

  for (const zone of zones) {
    // Verifier si le point est dans la zone
    let inZone = false;
    if (zone.type === 'zone' && zone.polygone && zone.polygone.length >= 3) {
      inZone = isInPolygone(lat, lng, zone.polygone);
    } else {
      // radar, axe, ou zone sans polygone — utiliser point + rayon
      inZone = isInPointZone(lat, lng, zone);
    }

    if (!inZone) continue;

    // Verifier l'exces de vitesse (avec tolerance)
    const limiteEffective = zone.vitesseMax + (zone.tolerance || 5);
    if (speed <= limiteEffective) continue;

    const depassement = Math.round(speed - zone.vitesseMax);

    // Anti-doublon : pas d'infraction pour le meme chauffeur + zone dans les 10 dernieres minutes
    const dixMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const existing = await InfractionVitesse.findOne({
      chauffeurId,
      zoneId: zone.id,
      dateCreation: { $gte: dixMinAgo }
    }).lean();

    if (existing) continue;

    // Determiner le vehicule assigne
    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    const vehiculeId = chauffeur ? chauffeur.vehiculeAssigne || null : null;

    const now = new Date();
    const categorie = getCategorie(depassement);

    const infraction = {
      id: generateId(),
      entrepriseId: entrepriseId || null,
      chauffeurId,
      vehiculeId,
      zoneId: zone.id,
      zoneNom: zone.nom,
      date: now.toISOString().split('T')[0],
      heure: now.toTimeString().slice(0, 8),
      vitesseEnregistree: Math.round(speed),
      vitesseLimite: zone.vitesseMax,
      depassement,
      categorie,
      montantAmende: AMENDES[categorie],
      position: { lat, lng },
      statut: 'detectee',
      dateCreation: now.toISOString()
    };

    await InfractionVitesse.create(infraction);
    console.log(`[SpeedCheck] Infraction detectee: ${chauffeurId} a ${Math.round(speed)} km/h dans "${zone.nom}" (limite ${zone.vitesseMax})`);
    return infraction;
  }

  return null;
}

module.exports = { checkSpeedViolation };
