/**
 * NotificationService — Service central de dispatch des notifications
 *
 * Gere l'envoi de notifications par Push (Web Push) et SMS (Twilio REST API)
 * Persiste chaque notification en base de donnees (Notification model)
 */

const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const Chauffeur = require('../models/Chauffeur');

let webPush = null;
try {
  webPush = require('web-push');
} catch (e) {
  console.warn('[NotifService] web-push non installe — push notifications desactivees');
}

// ===================== CONFIGURATION =====================

/**
 * Initialise les VAPID keys pour le web push
 */
function initVAPID() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'contact@pilote.app';

  if (!webPush || !publicKey || !privateKey) {
    console.warn('[NotifService] VAPID keys manquantes — push desactive');
    return false;
  }

  webPush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
  console.log('[NotifService] VAPID configure');
  return true;
}

/**
 * Retourne la cle publique VAPID pour le frontend
 */
function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Genere des VAPID keys (a executer une seule fois)
 */
function generateVAPIDKeys() {
  if (!webPush) {
    console.error('web-push non installe. Lancez: npm install web-push');
    return null;
  }
  const keys = webPush.generateVAPIDKeys();
  console.log('\n=== VAPID Keys generees ===');
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log('Ajoutez ces lignes dans votre fichier .env\n');
  return keys;
}

// ===================== GENERATION ID =====================

function generateId() {
  return 'NTF-' + Math.random().toString(36).substr(2, 8).toUpperCase();
}

// ===================== PUSH NOTIFICATIONS =====================

/**
 * Envoie une notification push a un chauffeur specifique
 */
async function sendPush(chauffeurId, titre, message, data = {}) {
  if (!webPush || !process.env.VAPID_PUBLIC_KEY) {
    return { success: false, error: 'Push non configure' };
  }

  try {
    // Recuperer toutes les subscriptions du chauffeur
    const subs = await PushSubscription.find({ chauffeurId }).lean();
    if (subs.length === 0) {
      return { success: false, error: 'Aucune subscription push' };
    }

    const payload = JSON.stringify({
      titre,
      message,
      url: data.url || '/driver/#/accueil',
      type: data.type || 'info',
      timestamp: Date.now()
    });

    const results = [];
    for (const sub of subs) {
      try {
        await webPush.sendNotification(sub.subscription, payload);
        results.push({ endpoint: sub.subscription.endpoint, success: true });
      } catch (err) {
        // Si la subscription est expiree ou invalide, la supprimer
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          console.log(`[NotifService] Subscription expiree supprimee pour ${chauffeurId}`);
        }
        results.push({ endpoint: sub.subscription.endpoint, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount > 0,
      sent: successCount,
      total: subs.length,
      results
    };
  } catch (err) {
    console.error(`[NotifService] Push error for ${chauffeurId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ===================== SMS (TWILIO REST API) =====================

/**
 * Envoie un SMS via l'API REST Twilio (sans SDK — juste fetch)
 */
async function sendSMS(telephone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio non configure' };
  }

  // Normaliser le numero : s'assurer qu'il commence par +225
  let to = telephone.replace(/\s+/g, '');
  if (!to.startsWith('+')) {
    to = '+225' + to;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const body = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: `[Pilote] ${message}`
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await res.json();

    if (res.ok) {
      console.log(`[NotifService] SMS envoye a ${to} — SID: ${data.sid}`);
      return { success: true, sid: data.sid };
    } else {
      console.error(`[NotifService] SMS echec a ${to}:`, data.message || data.code);
      return { success: false, error: data.message || `Twilio error ${data.code}` };
    }
  } catch (err) {
    console.error(`[NotifService] SMS error:`, err.message);
    return { success: false, error: err.message };
  }
}

// ===================== WHATSAPP (TWILIO REST API) =====================

/**
 * Envoie un message WhatsApp via l'API REST Twilio
 */
async function sendWhatsApp(telephone, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !fromWhatsApp) {
    return { success: false, error: 'Twilio WhatsApp non configure' };
  }

  // Normaliser le numero : s'assurer qu'il commence par +225
  let to = telephone.replace(/\s+/g, '');
  if (!to.startsWith('+')) {
    to = '+225' + to;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const body = new URLSearchParams({
      To: `whatsapp:${to}`,
      From: fromWhatsApp.startsWith('whatsapp:') ? fromWhatsApp : `whatsapp:${fromWhatsApp}`,
      Body: `[Pilote] ${message}`
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    const data = await res.json();

    if (res.ok) {
      console.log(`[NotifService] WhatsApp envoye a ${to} — SID: ${data.sid}`);
      return { success: true, sid: data.sid };
    } else {
      console.error(`[NotifService] WhatsApp echec a ${to}:`, data.message || data.code);
      return { success: false, error: data.message || `Twilio error ${data.code}` };
    }
  } catch (err) {
    console.error(`[NotifService] WhatsApp error:`, err.message);
    return { success: false, error: err.message };
  }
}

// ===================== DISPATCH PRINCIPAL =====================

/**
 * Envoie une notification a un chauffeur (push + SMS selon canal)
 * et la persiste en base de donnees
 */
async function notify(chauffeurId, type, titre, message, canal = 'push', data = {}) {
  const notif = {
    id: generateId(),
    chauffeurId,
    type,
    titre,
    message,
    canal,
    statut: 'envoyee',
    pushSent: false,
    smsSent: false,
    whatsappSent: false,
    dateCreation: new Date().toISOString()
  };

  let pushResult = null;
  let smsResult = null;
  let whatsappResult = null;

  const doPush = ['push', 'both', 'push+whatsapp', 'all'].includes(canal);
  const doSms = ['sms', 'both', 'sms+whatsapp', 'all'].includes(canal);
  const doWhatsapp = ['whatsapp', 'push+whatsapp', 'sms+whatsapp', 'all'].includes(canal);

  // Envoyer push
  if (doPush) {
    pushResult = await sendPush(chauffeurId, titre, message, { ...data, type });
    notif.pushSent = pushResult.success;
  }

  // Recuperer le telephone si SMS ou WhatsApp
  let chauffeur = null;
  if (doSms || doWhatsapp) {
    chauffeur = await Chauffeur.findOne({ id: chauffeurId }).lean();
  }

  // Envoyer SMS
  if (doSms) {
    if (chauffeur && chauffeur.telephone) {
      smsResult = await sendSMS(chauffeur.telephone, message);
      notif.smsSent = smsResult.success;
      if (smsResult.sid) notif.smsSid = smsResult.sid;
    } else {
      smsResult = { success: false, error: 'Pas de telephone' };
    }
  }

  // Envoyer WhatsApp
  if (doWhatsapp) {
    if (chauffeur && chauffeur.telephone) {
      whatsappResult = await sendWhatsApp(chauffeur.telephone, message);
      notif.whatsappSent = whatsappResult.success;
      if (whatsappResult.sid) notif.whatsappSid = whatsappResult.sid;
    } else {
      whatsappResult = { success: false, error: 'Pas de telephone' };
    }
  }

  // Determiner le statut global — au moins un canal reussi = ok
  const errors = [];
  if (doPush && pushResult && !pushResult.success) errors.push(`Push: ${pushResult.error}`);
  if (doSms && smsResult && !smsResult.success) errors.push(`SMS: ${smsResult.error}`);
  if (doWhatsapp && whatsappResult && !whatsappResult.success) errors.push(`WhatsApp: ${whatsappResult.error}`);

  const anySuccess = notif.pushSent || notif.smsSent || notif.whatsappSent;
  notif.statut = anySuccess ? 'envoyee' : 'echec';
  if (errors.length > 0) notif.erreur = errors.join(' | ');

  // Sauvegarder en DB
  try {
    await new Notification(notif).save();
  } catch (err) {
    console.error('[NotifService] Erreur sauvegarde notification:', err.message);
  }

  return notif;
}

/**
 * Envoie une notification a TOUS les chauffeurs actifs
 */
async function notifyAll(type, titre, message, canal = 'push', data = {}) {
  const chauffeurs = await Chauffeur.find({ statut: 'actif' }).lean();
  const results = [];

  for (const c of chauffeurs) {
    const result = await notify(c.id, type, titre, message, canal, data);
    results.push({ chauffeurId: c.id, nom: `${c.prenom} ${c.nom}`, statut: result.statut });
  }

  console.log(`[NotifService] Broadcast "${type}" envoye a ${results.length} chauffeurs`);
  return results;
}

/**
 * Envoie un SMS/WhatsApp a l'admin (pour les alertes admin)
 */
async function notifyAdmin(titre, message, settings) {
  const tel = settings?.notifications?.telephoneAdmin;
  if (!tel) {
    console.log('[NotifService] Pas de telephone admin configure');
    return { success: false, error: 'Pas de telephone admin' };
  }

  const fullMessage = `${titre}\n${message}`;
  const results = { sms: null, whatsapp: null };

  // Toujours envoyer par SMS si configure
  results.sms = await sendSMS(tel, fullMessage);

  // Aussi envoyer par WhatsApp si active
  if (settings?.notifications?.whatsappActif) {
    const waTel = settings?.notifications?.telephoneAdminWhatsapp || tel;
    results.whatsapp = await sendWhatsApp(waTel, fullMessage);
  }

  return {
    success: (results.sms?.success || results.whatsapp?.success) || false,
    ...results
  };
}

// ===================== EXPORTS =====================

module.exports = {
  initVAPID,
  getVapidPublicKey,
  generateVAPIDKeys,
  sendPush,
  sendSMS,
  sendWhatsApp,
  notify,
  notifyAll,
  notifyAdmin
};
