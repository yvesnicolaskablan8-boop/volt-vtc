/**
 * Notifications push des administrateurs — /api/push?action=…
 *
 *   cle           (admin)   clé publique VAPID à donner au navigateur pour s'abonner
 *   abonner       (admin)   enregistre l'abonnement de cet appareil
 *   desabonner    (admin)   le retire
 *   test          (admin)   envoie une notification d'essai aux appareils de l'appelant
 *   candidatures  (public)  annonce les candidatures pas encore annoncées. Appelée par
 *                           la base à chaque dépôt (déclencheur sur `leads`). Sans
 *                           secret, car sans danger : elle ne renvoie aucune donnée et
 *                           ne fait rien s'il n'y a rien de nouveau ; chaque
 *                           candidature est « réservée » avant l'envoi, donc annoncée
 *                           une seule fois même si l'adresse est appelée dix fois.
 *
 * La paire de clés VAPID est générée ici au premier appel et rangée dans
 * fleet_secrets_serveur (lisible du seul rôle service) : personne n'a de clé à
 * copier. Les écritures passent par SUPABASE_SERVICE_ROLE_KEY, déjà posée pour la
 * synchronisation planifiée.
 */
const crypto = require('crypto');
const { verifyAuth, isAdmin, setCors, handleOptions, entetesSupabase, SUPABASE_URL } = require('./_lib/helpers');
const webpush = require('./_lib/webpush');

const SUJET = 'https://pilote.tech';
const cleService = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

async function rest(chemin, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${chemin}`, {
    method: options.method || 'GET',
    headers: entetesSupabase(cleService(), options.prefer ? { Prefer: options.prefer } : {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const texte = await res.text();
  return texte ? JSON.parse(texte) : null;
}

/** Clés VAPID : lues dans le coffre du serveur, créées au premier appel. */
async function vapid() {
  let lignes = await rest('fleet_secrets_serveur?cle=eq.vapid&select=valeur');
  if (!lignes || !lignes.length) {
    await rest('fleet_secrets_serveur?on_conflict=cle', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: [{ cle: 'vapid', valeur: webpush.genererCles() }] });
    lignes = await rest('fleet_secrets_serveur?cle=eq.vapid&select=valeur');
  }
  const v = lignes[0].valeur;
  return { publique: v.publique, privee: v.privee, id: String(v.publique).slice(0, 16) };
}

const idAbonnement = (endpoint) => 'PSH-' + crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 24);

function abonnementValide(a) {
  try { return !!(a && new URL(a.endpoint).protocol === 'https:' && a.keys && a.keys.p256dh && a.keys.auth); } catch (e) { return false; }
}

/** Envoie `charge` à une liste d'abonnements ; supprime ceux qui n'existent plus. */
async function diffuser(abonnements, charge, cles) {
  let recus = 0; const perimes = [];
  await Promise.all(abonnements.map(async (ligne) => {
    try {
      const r = await webpush.envoyer(ligne.subscription, charge, cles, SUJET);
      if (r.ok) recus++; else if (r.perime) perimes.push(ligne.id);
    } catch (e) { /* appareil injoignable : on réessaiera à la prochaine candidature */ }
  }));
  if (perimes.length) {
    try { await rest(`fleet_push_subscriptions?id=in.(${perimes.map(encodeURIComponent).join(',')})`, { method: 'DELETE', prefer: 'return=minimal' }); } catch (e) { /* sans gravité */ }
  }
  return { recus, perimes };
}

// ---------- actions réservées aux administrateurs ----------
async function actionCle(req, res) {
  const cles = await vapid();
  res.json({ publicKey: cles.publique });
}

async function actionAbonner(req, res, user) {
  const corps = req.body || {};
  if (!abonnementValide(corps.subscription)) return res.status(400).json({ error: 'Abonnement invalide' });
  const cles = await vapid();
  await rest('fleet_push_subscriptions?on_conflict=id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: [{ id: idAbonnement(corps.subscription.endpoint), user_id: user.id, chauffeur_id: null, subscription: corps.subscription, user_agent: String(corps.userAgent || '').slice(0, 300), cle_vapid: cles.id }],
  });
  res.json({ success: true });
}

async function actionDesabonner(req, res) {
  const endpoint = (req.body || {}).endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint manquant' });
  await rest(`fleet_push_subscriptions?id=eq.${encodeURIComponent(idAbonnement(endpoint))}`, { method: 'DELETE', prefer: 'return=minimal' });
  res.json({ success: true });
}

async function actionTest(req, res, user) {
  const cles = await vapid();
  const abonnements = await rest(`fleet_push_subscriptions?select=id,subscription&cle_vapid=eq.${cles.id}&user_id=eq.${encodeURIComponent(user.id)}`);
  if (!abonnements.length) return res.status(404).json({ error: 'Aucun appareil abonné pour ce compte' });
  const { recus } = await diffuser(abonnements, { titre: 'Pilote', message: 'Les alertes sont actives sur cet appareil.', url: '/app#/candidatures', type: 'essai' }, cles);
  res.json({ success: recus > 0, appareils: recus });
}

// ---------- action publique : annoncer les nouvelles candidatures ----------
async function actionCandidatures(req, res) {
  if (!cleService()) return res.status(503).json({ error: 'Non configure' });
  const depuis = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // Réserver d'abord (une seule annonce par candidature, même en cas d'appels simultanés) : la
  // mise à jour ne touche que les lignes encore « non annoncées », et renvoie celles qu'ELLE a prises.
  const prises = await rest(`leads?type=eq.chauffeur&notifie_le=is.null&created_at=gte.${encodeURIComponent(depuis)}&select=id,prenom,nom,ville`, {
    method: 'PATCH', prefer: 'return=representation', body: { notifie_le: new Date().toISOString() },
  }) || [];
  if (!prises.length) return res.json({ annoncees: 0 });

  const cles = await vapid();
  const abonnements = await rest(`fleet_push_subscriptions?select=id,subscription&cle_vapid=eq.${cles.id}&user_id=not.is.null`);
  if (!abonnements.length) return res.json({ annoncees: prises.length, appareils: 0 });

  const nomDe = (c) => `${c.prenom || ''} ${c.nom || ''}`.trim() || 'Un candidat';
  const charges = prises.length <= 3
    ? prises.map(c => ({ titre: 'Nouvelle candidature', message: `${nomDe(c)}${c.ville ? ` (${c.ville})` : ''} vient de postuler. Rappelez-le vite.`, url: '/app#/candidatures', type: 'candidature-' + c.id }))
    : [{ titre: `${prises.length} nouvelles candidatures`, message: `${prises.slice(0, 3).map(nomDe).join(', ')}… à rappeler.`, url: '/app#/candidatures', type: 'candidatures' }];
  let appareils = 0, vivants = abonnements;
  for (const charge of charges) {
    const { recus, perimes } = await diffuser(vivants, charge, cles);
    appareils = Math.max(appareils, recus);
    if (perimes.length) vivants = vivants.filter(a => !perimes.includes(a.id));   // ne pas réessayer un appareil disparu
  }
  res.json({ annoncees: prises.length, appareils });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  const action = req.query.action;
  try {
    if (action === 'candidatures') return await actionCandidatures(req, res);

    if (!cleService()) return res.status(503).json({ error: 'Notifications non configurees sur le serveur' });
    const user = await verifyAuth(req);
    if (!user || !(await isAdmin(req))) return res.status(403).json({ error: 'Reserve a l\'administration' });
    if (action === 'cle') return await actionCle(req, res);
    if (action === 'abonner') return await actionAbonner(req, res, user);
    if (action === 'desabonner') return await actionDesabonner(req, res);
    if (action === 'test') return await actionTest(req, res, user);
    return res.status(400).json({ error: 'Action inconnue', actions: ['cle', 'abonner', 'desabonner', 'test', 'candidatures'] });
  } catch (e) {
    console.error('[push]', action, e.message);
    res.status(500).json({ error: 'Erreur interne' });
  }
};
