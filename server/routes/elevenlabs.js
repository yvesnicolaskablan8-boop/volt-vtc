const express = require('express');
const fetch = require('node-fetch');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

const EL_BASE = 'https://api.elevenlabs.io/v1';

// Helper : appel API ElevenLabs
async function elFetch(path, opts = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY non configurée');
  const res = await fetch(`${EL_BASE}${path}`, {
    ...opts,
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail?.message || data.detail || JSON.stringify(data));
  return data;
}

// Helper : calculer la dette totale d'un chauffeur
async function getDriverDebt(chauffeurId) {
  const Versement = require('../models/Versement');
  const versements = await Versement.find({
    chauffeurId,
    traitementManquant: 'dette',
    manquant: { $gt: 0 }
  }).lean();
  return versements.reduce((sum, v) => sum + (v.manquant || 0), 0);
}

// =================== ROUTES AUTHENTIFIÉES ===================
router.use(authMiddleware);

/**
 * POST /api/elevenlabs/setup-agent
 * Création initiale de l'agent conversationnel ElevenLabs
 */
router.post('/setup-agent', async (req, res, next) => {
  try {
    const data = await elFetch('/convai/agents/create', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Volt Recouvrement',
        conversation_config: {
          agent: {
            first_message: "Bonjour {{driver_name}}, ici l'assistant de Volt Transport. Je vous contacte au sujet d'un solde impayé de {{debt_amount}} francs CFA. Avez-vous un moment pour en discuter ?",
            language: 'fr',
            prompt: {
              prompt: `Tu es l'assistant téléphonique de Volt Transport VTC, une société de transport à Abidjan, Côte d'Ivoire.

CONTEXTE :
- Tu appelles le chauffeur {{driver_name}} qui a une dette de {{debt_amount}} FCFA
- Cette dette correspond à des versements quotidiens non réglés (redevance pour l'utilisation du véhicule)
- Le chauffeur conduit le véhicule {{vehicle_info}}

TON RÔLE :
1. Rappeler poliment au chauffeur qu'il a un solde impayé
2. Lui demander quand il compte régler
3. Proposer des solutions : paiement immédiat via Wave, paiement partiel, ou plan de remboursement
4. Rester professionnel, respectueux et empathique
5. Ne jamais menacer ni être agressif

RÈGLES IMPORTANTES :
- Parle en français simple et clair
- Sois concis, pas de longs discours
- Si le chauffeur dit qu'il va payer, demande une date précise
- Si le chauffeur conteste le montant, note sa réclamation et dis qu'un responsable va vérifier
- Si le chauffeur est agressif ou raccroche, reste calme et termine poliment
- Maximum 3 minutes d'appel

À LA FIN :
- Résume ce qui a été convenu
- Remercie le chauffeur
- Dis au revoir poliment`,
              llm: 'gpt-4o-mini',
              temperature: 0.7,
              max_tokens: -1
            },
            dynamic_variables: {
              dynamic_variable_placeholders: {
                driver_name: { type: 'string', description: 'Nom du chauffeur' },
                debt_amount: { type: 'string', description: 'Montant de la dette en FCFA' },
                vehicle_info: { type: 'string', description: 'Info véhicule' }
              }
            }
          },
          tts: {
            model_id: 'eleven_multilingual_v2',
            voice_id: req.body.voice_id || 'pNInz6obpgDQGcFmaJgB',
            stability: 0.5,
            similarity_boost: 0.75,
            speed: 1.0
          },
          conversation: {
            max_duration_seconds: 180
          },
          turn: {
            turn_timeout: 7
          }
        }
      })
    });

    console.log(`[ElevenLabs] Agent créé: ${data.agent_id}`);
    res.json({ agent_id: data.agent_id, message: 'Agent créé. Ajoutez ELEVENLABS_AGENT_ID=' + data.agent_id + ' dans vos variables d\'environnement.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/elevenlabs/status
 * Vérifie que la configuration est complète
 */
router.get('/status', (req, res) => {
  const config = {
    apiKey: !!process.env.ELEVENLABS_API_KEY,
    agentId: !!process.env.ELEVENLABS_AGENT_ID,
    phoneNumberId: !!process.env.ELEVENLABS_PHONE_NUMBER_ID,
    webhookSecret: !!process.env.ELEVENLABS_WEBHOOK_SECRET
  };
  const ready = config.apiKey && config.agentId && config.phoneNumberId;
  res.json({ ready, config });
});

/**
 * POST /api/elevenlabs/call/:chauffeurId
 * Déclenche un appel de recouvrement pour un chauffeur
 */
router.post('/call/:chauffeurId', async (req, res, next) => {
  try {
    const Chauffeur = require('../models/Chauffeur');
    const DebtCall = require('../models/DebtCall');

    const chauffeur = await Chauffeur.findOne({ id: req.params.chauffeurId }).lean();
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur introuvable' });

    const telephone = chauffeur.telephone;
    if (!telephone) return res.status(400).json({ error: 'Pas de numéro de téléphone pour ce chauffeur' });

    const dette = await getDriverDebt(chauffeur.id);
    if (dette <= 0) return res.status(400).json({ error: 'Ce chauffeur n\'a pas de dette' });

    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
    if (!agentId || !phoneNumberId) {
      return res.status(500).json({ error: 'Configuration ElevenLabs incomplète (AGENT_ID ou PHONE_NUMBER_ID manquant)' });
    }

    // Formater le numéro en E.164 (+225...)
    let toNumber = telephone.replace(/\s+/g, '');
    if (!toNumber.startsWith('+')) {
      toNumber = toNumber.startsWith('225') ? '+' + toNumber : '+225' + toNumber;
    }

    // Infos véhicule
    const Vehicule = require('../models/Vehicule');
    const vehicule = chauffeur.vehiculeAssigne
      ? await Vehicule.findOne({ id: chauffeur.vehiculeAssigne }).lean()
      : null;
    const vehicleInfo = vehicule
      ? `${vehicule.marque || ''} ${vehicule.modele || ''} (${vehicule.immatriculation || ''})`.trim()
      : 'non assigné';

    // Appel ElevenLabs
    const data = await elFetch('/convai/twilio/outbound-call', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: {
            driver_name: `${chauffeur.prenom || ''} ${chauffeur.nom || ''}`.trim(),
            debt_amount: dette.toString(),
            vehicle_info: vehicleInfo
          }
        }
      })
    });

    // Enregistrer l'appel
    const callId = 'CALL-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const call = new DebtCall({
      id: callId,
      chauffeurId: chauffeur.id,
      conversationId: data.conversation_id || null,
      callSid: data.callSid || null,
      montantDette: dette,
      statut: 'en_cours',
      declenchement: req.body.auto ? 'automatique' : 'manuel',
      dateAppel: new Date().toISOString().split('T')[0],
      dateCreation: new Date().toISOString()
    });
    await call.save();

    console.log(`[ElevenLabs] Appel ${callId} lancé pour ${chauffeur.prenom} ${chauffeur.nom} (dette: ${dette} FCFA)`);
    res.json({
      success: true,
      callId,
      conversationId: data.conversation_id,
      chauffeur: `${chauffeur.prenom} ${chauffeur.nom}`,
      dette,
      message: `Appel en cours vers ${toNumber}`
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/elevenlabs/call-all-debtors
 * Appelle tous les chauffeurs ayant une dette
 */
router.post('/call-all-debtors', async (req, res, next) => {
  try {
    const Chauffeur = require('../models/Chauffeur');
    const Versement = require('../models/Versement');
    const DebtCall = require('../models/DebtCall');

    // Trouver les chauffeurs avec dettes
    const versements = await Versement.find({
      traitementManquant: 'dette',
      manquant: { $gt: 0 }
    }).lean();

    // Grouper par chauffeur
    const dettes = {};
    versements.forEach(v => {
      if (!dettes[v.chauffeurId]) dettes[v.chauffeurId] = 0;
      dettes[v.chauffeurId] += v.manquant || 0;
    });

    const chauffeurIds = Object.keys(dettes);
    if (chauffeurIds.length === 0) {
      return res.json({ success: true, called: 0, message: 'Aucun chauffeur endetté' });
    }

    const chauffeurs = await Chauffeur.find({
      id: { $in: chauffeurIds },
      statut: { $ne: 'inactif' },
      telephone: { $exists: true, $ne: '' }
    }).lean();

    // Vérifier qu'on n'a pas déjà appelé aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const todayCalls = await DebtCall.find({ dateAppel: today }).lean();
    const alreadyCalled = new Set(todayCalls.map(c => c.chauffeurId));

    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
    if (!agentId || !phoneNumberId) {
      return res.status(500).json({ error: 'Configuration ElevenLabs incomplète' });
    }

    let called = 0;
    let skipped = 0;
    const errors = [];

    for (const ch of chauffeurs) {
      if (alreadyCalled.has(ch.id)) { skipped++; continue; }

      const dette = dettes[ch.id];
      if (dette <= 0) { skipped++; continue; }

      let toNumber = (ch.telephone || '').replace(/\s+/g, '');
      if (!toNumber) { skipped++; continue; }
      if (!toNumber.startsWith('+')) {
        toNumber = toNumber.startsWith('225') ? '+' + toNumber : '+225' + toNumber;
      }

      try {
        // Espace entre les appels (2 secondes) pour éviter la surcharge
        if (called > 0) await new Promise(r => setTimeout(r, 2000));

        const Vehicule = require('../models/Vehicule');
        const vehicule = ch.vehiculeAssigne
          ? await Vehicule.findOne({ id: ch.vehiculeAssigne }).lean()
          : null;
        const vehicleInfo = vehicule
          ? `${vehicule.marque || ''} ${vehicule.modele || ''} (${vehicule.immatriculation || ''})`.trim()
          : 'non assigné';

        const data = await elFetch('/convai/twilio/outbound-call', {
          method: 'POST',
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
      } catch (err) {
        errors.push({ chauffeur: `${ch.prenom} ${ch.nom}`, error: err.message });
      }
    }

    console.log(`[ElevenLabs] Batch: ${called} appels lancés, ${skipped} ignorés, ${errors.length} erreurs`);
    res.json({ success: true, called, skipped, errors: errors.length, details: errors, message: `${called} appel(s) lancé(s)` });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/elevenlabs/calls
 * Historique des appels
 */
router.get('/calls', async (req, res, next) => {
  try {
    const DebtCall = require('../models/DebtCall');
    const calls = await DebtCall.find().sort({ dateCreation: -1 }).limit(200).lean();
    res.json(calls);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/elevenlabs/conversation/:conversationId
 * Détails d'une conversation ElevenLabs
 */
router.get('/conversation/:conversationId', async (req, res, next) => {
  try {
    const data = await elFetch(`/convai/conversations/${req.params.conversationId}`);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/elevenlabs/debtors
 * Liste des chauffeurs endettés avec leur dette totale
 */
router.get('/debtors', async (req, res, next) => {
  try {
    const Chauffeur = require('../models/Chauffeur');
    const Versement = require('../models/Versement');
    const DebtCall = require('../models/DebtCall');

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
    const chauffeurs = await Chauffeur.find({ id: { $in: chauffeurIds } }).lean();

    // Dernier appel par chauffeur
    const today = new Date().toISOString().split('T')[0];
    const recentCalls = await DebtCall.find({
      chauffeurId: { $in: chauffeurIds }
    }).sort({ dateCreation: -1 }).lean();

    const lastCallMap = {};
    recentCalls.forEach(c => {
      if (!lastCallMap[c.chauffeurId]) lastCallMap[c.chauffeurId] = c;
    });

    const result = chauffeurs.map(ch => ({
      id: ch.id,
      nom: ch.nom,
      prenom: ch.prenom,
      telephone: ch.telephone,
      dette: dettes[ch.id] || 0,
      dernierAppel: lastCallMap[ch.id] || null,
      appeleAujourdhui: !!(lastCallMap[ch.id] && lastCallMap[ch.id].dateAppel === today)
    })).sort((a, b) => b.dette - a.dette);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
