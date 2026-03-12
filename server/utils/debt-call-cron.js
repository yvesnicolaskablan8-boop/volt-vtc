/**
 * DebtCallCron — Appels automatiques de recouvrement
 * Appelle les chauffeurs endettés à 10h00 chaque jour ouvré (lun-sam)
 */
const fetch = require('node-fetch');

let interval = null;
let enabled = false;
let lastRunDate = null;

const TARGET_HOUR = 10; // 10h00

function start() {
  if (interval) return;
  enabled = true;
  // Vérifier toutes les 15 minutes
  interval = setInterval(check, 15 * 60 * 1000);
  console.log('[DebtCallCron] Démarré — appels auto à 10h00 lun-sam');
}

function stop() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  enabled = false;
}

function setEnabled(val) {
  enabled = val;
  if (!val) console.log('[DebtCallCron] Désactivé');
  else console.log('[DebtCallCron] Activé');
}

function getStatus() {
  return { enabled, lastRunDate, nextCheck: 'Toutes les 15 min' };
}

async function check() {
  if (!enabled) return;

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=dim, 6=sam
  const today = now.toISOString().split('T')[0];

  // Pas le dimanche
  if (day === 0) return;

  // Vérifier l'heure (10h00 ± 15 min)
  if (hour !== TARGET_HOUR) return;

  // Déjà exécuté aujourd'hui ?
  if (lastRunDate === today) return;

  // Vérifier que la config est complète
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_AGENT_ID || !process.env.ELEVENLABS_PHONE_NUMBER_ID) {
    return;
  }

  lastRunDate = today;
  console.log(`[DebtCallCron] Lancement des appels automatiques — ${today}`);

  try {
    await runCalls();
  } catch (err) {
    console.error('[DebtCallCron] Erreur:', err.message);
  }
}

async function runCalls() {
  const Chauffeur = require('../models/Chauffeur');
  const Versement = require('../models/Versement');
  const DebtCall = require('../models/DebtCall');
  const Vehicule = require('../models/Vehicule');

  const EL_BASE = 'https://api.elevenlabs.io/v1';
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

  // 1. Trouver les chauffeurs endettés
  const versements = await Versement.find({
    traitementManquant: 'dette',
    manquant: { $gt: 0 }
  }).lean();

  const dettes = {};
  versements.forEach(v => {
    if (!dettes[v.chauffeurId]) dettes[v.chauffeurId] = 0;
    dettes[v.chauffeurId] += v.manquant || 0;
  });

  const chauffeurIds = Object.keys(dettes);
  if (chauffeurIds.length === 0) {
    console.log('[DebtCallCron] Aucun chauffeur endetté');
    return;
  }

  const chauffeurs = await Chauffeur.find({
    id: { $in: chauffeurIds },
    statut: { $ne: 'inactif' },
    telephone: { $exists: true, $ne: '' }
  }).lean();

  // 2. Vérifier les appels déjà faits aujourd'hui
  const today = new Date().toISOString().split('T')[0];
  const todayCalls = await DebtCall.find({ dateAppel: today }).lean();
  const alreadyCalled = new Set(todayCalls.map(c => c.chauffeurId));

  let called = 0;
  for (const ch of chauffeurs) {
    if (alreadyCalled.has(ch.id)) continue;

    const dette = dettes[ch.id];
    if (dette <= 0) continue;

    let toNumber = (ch.telephone || '').replace(/\s+/g, '');
    if (!toNumber) continue;
    if (!toNumber.startsWith('+')) {
      toNumber = toNumber.startsWith('225') ? '+' + toNumber : '+225' + toNumber;
    }

    try {
      // Pause entre les appels
      if (called > 0) await new Promise(r => setTimeout(r, 3000));

      const vehicule = ch.vehiculeAssigne
        ? await Vehicule.findOne({ id: ch.vehiculeAssigne }).lean()
        : null;
      const vehicleInfo = vehicule
        ? `${vehicule.marque || ''} ${vehicule.modele || ''} (${vehicule.immatriculation || ''})`.trim()
        : 'non assigné';

      const res = await fetch(`${EL_BASE}/convai/twilio/outbound-call`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: toNumber,
          conversation_initiation_client_data: {
            dynamic_variables: {
              driver_name: `${ch.prenom || ''} ${ch.nom || ''}`.trim(),
              debt_amount: dette.toString(),
              vehicle_info: vehicleInfo
            }
          }
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || JSON.stringify(data));

      const callId = 'CALL-' + Math.random().toString(36).substr(2, 8).toUpperCase();
      const call = new DebtCall({
        id: callId,
        chauffeurId: ch.id,
        conversationId: data.conversation_id || null,
        callSid: data.callSid || null,
        montantDette: dette,
        statut: 'en_cours',
        declenchement: 'automatique',
        dateAppel: today,
        dateCreation: new Date().toISOString()
      });
      await call.save();
      called++;
      console.log(`[DebtCallCron] Appel ${callId} → ${ch.prenom} ${ch.nom} (${dette} FCFA)`);
    } catch (err) {
      console.error(`[DebtCallCron] Erreur pour ${ch.prenom} ${ch.nom}: ${err.message}`);
    }
  }

  console.log(`[DebtCallCron] Terminé — ${called} appel(s) lancé(s)`);
}

module.exports = { start, stop, setEnabled, getStatus, runCalls };
