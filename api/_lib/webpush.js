/**
 * Web Push sans dépendance : VAPID (RFC 8292) + chiffrement aes128gcm (RFC 8291).
 * Les fonctions serverless de ce projet n'ont aucun paquet npm ; tout repose sur
 * le module `crypto` de Node. `chiffrer()` est vérifié contre l'exemple officiel
 * de la RFC 8291 (annexe A) — voir le test dans l'historique du commit.
 */
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (cle, donnees) => crypto.createHmac('sha256', cle).update(donnees).digest();

/** Paire de clés VAPID (P-256) : publique = point non compressé (65 octets), privée = scalaire (32 octets), en base64url. */
function genererCles() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publique: b64u(ecdh.getPublicKey()), privee: b64u(ecdh.getPrivateKey()) };
}

/** Jeton VAPID (JWT ES256) pour l'origine du service de push visé. */
function jetonVapid(audience, sujet, publique, privee) {
  const pub = deB64u(publique);
  const cle = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: b64u(deB64u(privee)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const entete = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const corps = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet }));
  const signature = crypto.sign('sha256', Buffer.from(`${entete}.${corps}`), { key: cle, dsaEncoding: 'ieee-p1363' });
  return `${entete}.${corps}.${b64u(signature)}`;
}

/**
 * Chiffre `message` (Buffer ou texte) pour un abonnement { p256dh, auth }.
 * `essai` ({ sel, clePrivee }) ne sert qu'aux tests, pour rejouer l'exemple de la RFC.
 */
function chiffrer(message, p256dh, auth, essai) {
  const uaPublique = deB64u(p256dh);
  const secretAuth = deB64u(auth);
  const sel = essai && essai.sel ? deB64u(essai.sel) : crypto.randomBytes(16);
  const ecdh = crypto.createECDH('prime256v1');
  if (essai && essai.clePrivee) ecdh.setPrivateKey(deB64u(essai.clePrivee)); else ecdh.generateKeys();
  const asPublique = ecdh.getPublicKey();
  const secretEcdh = ecdh.computeSecret(uaPublique);

  const prkCle = hmac(secretAuth, secretEcdh);
  const ikm = hmac(prkCle, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublique, asPublique, Buffer.from([1])]));
  const prk = hmac(sel, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);

  const clair = Buffer.concat([Buffer.isBuffer(message) ? message : Buffer.from(String(message), 'utf8'), Buffer.from([2])]);   // 0x02 = dernier enregistrement
  const aes = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const chiffre = Buffer.concat([aes.update(clair), aes.final(), aes.getAuthTag()]);

  const entete = Buffer.alloc(21);
  sel.copy(entete, 0);
  entete.writeUInt32BE(4096, 16);
  entete.writeUInt8(asPublique.length, 20);
  return Buffer.concat([entete, asPublique, chiffre]);
}

/**
 * Envoie une notification à un abonnement. Renvoie { ok, statut, perime } ;
 * `perime` = l'abonnement n'existe plus ou appartient à une autre clé : à supprimer.
 */
async function envoyer(abonnement, charge, vapid, sujet) {
  const url = new URL(abonnement.endpoint);
  const corps = chiffrer(JSON.stringify(charge), abonnement.keys.p256dh, abonnement.keys.auth);
  const res = await fetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jetonVapid(url.origin, sujet, vapid.publique, vapid.privee)}, k=${vapid.publique}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',
    },
    body: corps,
  });
  return { ok: res.status >= 200 && res.status < 300, statut: res.status, perime: [401, 403, 404, 410].includes(res.status) };
}

module.exports = { genererCles, jetonVapid, chiffrer, envoyer, b64u, deB64u };
