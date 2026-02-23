const express = require('express');
const authMiddleware = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Chauffeur = require('../models/Chauffeur');
const notifService = require('../utils/notification-service');

const router = express.Router();
router.use(authMiddleware);

// =================== LIST CONVERSATIONS ===================

// GET /api/messages — Liste des conversations
router.get('/', async (req, res, next) => {
  try {
    const query = { statut: req.query.statut || 'active' };
    if (req.query.chauffeurId) query.chauffeurId = req.query.chauffeurId;

    const conversations = await Conversation.find(query)
      .sort({ dernierMessageDate: -1 })
      .lean();

    // Enrichir avec les noms des chauffeurs
    const chauffeurs = await Chauffeur.find().lean();
    const chauffeurMap = {};
    chauffeurs.forEach(c => { chauffeurMap[c.id] = c; });

    const enriched = conversations.map(conv => {
      const { _id, __v, messages, ...rest } = conv;
      const ch = chauffeurMap[conv.chauffeurId];
      return {
        ...rest,
        chauffeurNom: ch ? `${ch.prenom} ${ch.nom}` : conv.chauffeurId,
        chauffeurTelephone: ch ? ch.telephone : null,
        nbMessages: (messages || []).length
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// =================== GET CONVERSATION ===================

// GET /api/messages/:id — Detail conversation avec messages
router.get('/:id', async (req, res, next) => {
  try {
    // Exclure les routes speciales
    if (['call'].includes(req.params.id)) return next();

    const conv = await Conversation.findOne({ id: req.params.id }).lean();
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const { _id, __v, ...rest } = conv;

    // Enrichir avec info chauffeur
    const ch = await Chauffeur.findOne({ id: conv.chauffeurId }).lean();
    rest.chauffeurNom = ch ? `${ch.prenom} ${ch.nom}` : conv.chauffeurId;
    rest.chauffeurTelephone = ch ? ch.telephone : null;

    res.json(rest);
  } catch (err) {
    next(err);
  }
});

// =================== CREATE CONVERSATION ===================

// POST /api/messages — Creer une nouvelle conversation
router.post('/', async (req, res, next) => {
  try {
    const { chauffeurId, sujet, message } = req.body;

    if (!chauffeurId || !message) {
      return res.status(400).json({ error: 'chauffeurId et message requis' });
    }

    const id = 'CONV-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const msgId = 'MSG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const now = new Date().toISOString();

    const conv = new Conversation({
      id,
      chauffeurId,
      sujet: sujet || '',
      statut: 'active',
      dernierMessage: message.substring(0, 100),
      dernierMessageDate: now,
      nonLusAdmin: 0,
      nonLusChauffeur: 1,
      messages: [{
        id: msgId,
        auteur: 'admin',
        auteurNom: 'Admin',
        contenu: message,
        type: 'message',
        dateCreation: now
      }],
      dateCreation: now
    });

    await conv.save();

    // Push notification au chauffeur
    try {
      await notifService.notify(
        chauffeurId,
        'annonce',
        sujet || 'Nouveau message',
        message.substring(0, 150),
        'push',
        { url: '/driver/#/messagerie' }
      );
    } catch (e) {
      console.warn('[Messages] Push notification echouee:', e.message);
    }

    res.status(201).json(conv.toJSON());
  } catch (err) {
    next(err);
  }
});

// =================== REPLY ===================

// POST /api/messages/:id/reply — Ajouter un message
router.post('/:id/reply', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message requis' });

    const conv = await Conversation.findOne({ id: req.params.id });
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    const msgId = 'MSG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const now = new Date().toISOString();

    conv.messages.push({
      id: msgId,
      auteur: 'admin',
      auteurNom: 'Admin',
      contenu: message,
      type: 'message',
      dateCreation: now
    });

    conv.dernierMessage = message.substring(0, 100);
    conv.dernierMessageDate = now;
    conv.nonLusChauffeur = (conv.nonLusChauffeur || 0) + 1;

    await conv.save();

    // Push notification au chauffeur
    try {
      await notifService.notify(
        conv.chauffeurId,
        'annonce',
        conv.sujet || 'Nouveau message',
        message.substring(0, 150),
        'push',
        { url: '/driver/#/messagerie' }
      );
    } catch (e) {
      console.warn('[Messages] Push notification echouee:', e.message);
    }

    res.json({ success: true, message: conv.messages[conv.messages.length - 1] });
  } catch (err) {
    next(err);
  }
});

// =================== MARK READ ===================

// PUT /api/messages/:id/read — Marquer lus cote admin
router.put('/:id/read', async (req, res, next) => {
  try {
    const conv = await Conversation.findOne({ id: req.params.id });
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    conv.nonLusAdmin = 0;
    await conv.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// =================== ARCHIVE ===================

// PUT /api/messages/:id/archive — Archiver une conversation
router.put('/:id/archive', async (req, res, next) => {
  try {
    const conv = await Conversation.findOne({ id: req.params.id });
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable' });

    conv.statut = conv.statut === 'archivee' ? 'active' : 'archivee';
    await conv.save();

    res.json({ success: true, statut: conv.statut });
  } catch (err) {
    next(err);
  }
});

// =================== TWILIO VOICE CALL ===================

// POST /api/messages/call — Initier un appel telephonique via Twilio
router.post('/call', async (req, res, next) => {
  try {
    const { chauffeurId, conversationId } = req.body;

    if (!chauffeurId) return res.status(400).json({ error: 'chauffeurId requis' });

    const chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
    if (!chauffeur || !chauffeur.telephone) {
      return res.status(400).json({ error: 'Chauffeur introuvable ou sans telephone' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return res.status(500).json({ error: 'Twilio non configure' });
    }

    // Normaliser le numero
    let toNumber = chauffeur.telephone.replace(/[\s.-]/g, '');
    if (toNumber.startsWith('0')) {
      toNumber = '+225' + toNumber.substring(1);
    }
    if (!toNumber.startsWith('+')) {
      toNumber = '+225' + toNumber;
    }

    // Construire l'URL TwiML
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://volt-vtc-production.up.railway.app'
      : `http://localhost:${process.env.PORT || 3001}`;
    const twimlUrl = `${baseUrl}/api/messages/call/twiml`;
    const statusCallback = `${baseUrl}/api/messages/call/status`;

    // Appel Twilio Voice API
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('From', fromNumber);
    params.append('To', toNumber);
    params.append('Url', twimlUrl);
    params.append('StatusCallback', statusCallback);
    params.append('StatusCallbackMethod', 'POST');
    params.append('StatusCallbackEvent', 'completed');

    const twilioRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error('[Call] Twilio error:', twilioData);
      return res.status(500).json({ error: twilioData.message || 'Erreur Twilio' });
    }

    const callSid = twilioData.sid;

    // Ajouter un message de type 'appel' dans la conversation
    if (conversationId) {
      const conv = await Conversation.findOne({ id: conversationId });
      if (conv) {
        const msgId = 'MSG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        const now = new Date().toISOString();

        conv.messages.push({
          id: msgId,
          auteur: 'admin',
          auteurNom: 'Admin',
          contenu: `Appel telephonique vers ${chauffeur.prenom} ${chauffeur.nom}`,
          type: 'appel',
          callData: {
            callSid,
            duree: 0,
            statut: 'initiated'
          },
          dateCreation: now
        });

        conv.dernierMessage = 'Appel telephonique';
        conv.dernierMessageDate = now;
        await conv.save();
      }
    }

    console.log(`[Call] Appel initie vers ${chauffeur.prenom} ${chauffeur.nom} (${toNumber}) — SID: ${callSid}`);

    res.json({
      success: true,
      callSid,
      chauffeurNom: `${chauffeur.prenom} ${chauffeur.nom}`,
      toNumber
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/call/twiml — Endpoint TwiML pour Twilio
// NOTE: Pas d'auth middleware car Twilio appelle directement
router.get('/call/twiml', (req, res) => {
  res.type('text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR" voice="alice">Appel de votre gestionnaire Volt V.T.C. Veuillez patienter.</Say>
  <Pause length="30"/>
</Response>`);
});

// POST /api/messages/call/status — Callback statut appel Twilio
// NOTE: Pas d'auth middleware car Twilio appelle directement
router.post('/call/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    if (!CallSid) return res.sendStatus(200);

    console.log(`[Call] Status callback — SID: ${CallSid}, Status: ${CallStatus}, Duration: ${CallDuration}s`);

    // Trouver la conversation avec ce callSid
    const conv = await Conversation.findOne({ 'messages.callData.callSid': CallSid });
    if (conv) {
      const msg = conv.messages.find(m => m.callData && m.callData.callSid === CallSid);
      if (msg) {
        msg.callData.statut = CallStatus || 'completed';
        msg.callData.duree = parseInt(CallDuration) || 0;

        // Mettre a jour le contenu du message avec la duree
        const dureeMin = Math.floor((msg.callData.duree || 0) / 60);
        const dureeSec = (msg.callData.duree || 0) % 60;
        const statutLabel = {
          completed: 'Termine',
          'no-answer': 'Sans reponse',
          busy: 'Occupe',
          failed: 'Echoue',
          canceled: 'Annule'
        }[CallStatus] || CallStatus;
        msg.contenu = `Appel telephonique — ${statutLabel}${msg.callData.duree > 0 ? ` (${dureeMin}m${String(dureeSec).padStart(2, '0')}s)` : ''}`;

        await conv.save();
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Call] Status callback error:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
