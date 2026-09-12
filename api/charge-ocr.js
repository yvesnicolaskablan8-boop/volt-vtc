/**
 * Lecture automatique d'un ticket de charge photographié par le chauffeur
 * (recharge du véhicule, lavage, autre). La photo est envoyée à Claude (vision)
 * qui renvoie le type, le montant TTC en FCFA et un libellé ; l'application
 * chauffeur pré-remplit le formulaire et le chauffeur vérifie avant d'enregistrer.
 *
 *   GET  /api/charge-ocr            → { configure: bool, modele }   (l'app cache le bouton photo si false)
 *   POST /api/charge-ocr { image }  → { lisible, type, montant, libelle, date, confiance, modele }
 *        image = data URL base64 (JPEG, PNG ou WebP), 3 Mo max, réduite côté client.
 *
 * Variables Vercel : ANTHROPIC_API_KEY (obligatoire pour le POST),
 *                    CHARGE_OCR_MODEL (facultatif, défaut claude-haiku-4-5-20251001).
 */
const { verifyAuth, setCors, handleOptions } = require('./_lib/helpers');

const MODEL = process.env.CHARGE_OCR_MODEL || 'claude-haiku-4-5-20251001';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const CONSIGNE = `Tu lis la photo d'un reçu ou ticket de dépense d'un chauffeur VTC à Abidjan (Côte d'Ivoire), en francs CFA.
Dépenses possibles : "recharge" (recharge électrique du véhicule : borne, station de recharge, kWh, énergie), "lavage" (lavage du véhicule), ou "autre" (péage, parking, petite réparation, etc.).
Réponds UNIQUEMENT avec un objet JSON, sans aucun texte autour, de la forme :
{"lisible": true, "type": "recharge", "montant": 5000, "libelle": "lieu ou commerçant, 40 caractères max", "date": "AAAA-MM-JJ", "confiance": 0.9}
Règles :
- "montant" est le TOTAL payé (TTC), en entier, sans décimales ; ignore la TVA, les sous-totaux et les montants unitaires ; s'il y a plusieurs tickets, prends le total le plus visible.
- "date" est la date imprimée sur le ticket, sinon null.
- "libelle" est le nom du commerçant ou du lieu, sinon null.
- "confiance" entre 0 et 1 traduit ta certitude sur le montant.
- Si la photo n'est pas un reçu, ou si le montant n'est pas lisible : {"lisible": false, "type": "autre", "montant": null, "libelle": null, "date": null, "confiance": 0}.`;

function parseImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const bytes = Math.floor(m[2].length * 3 / 4);
  if (bytes > MAX_IMAGE_BYTES) return { tooBig: true };
  return { mediaType: m[1], data: m[2] };
}

function extraireJson(texte) {
  const s = String(texte || '');
  const debut = s.indexOf('{');
  const fin = s.lastIndexOf('}');
  if (debut < 0 || fin <= debut) return null;
  try { return JSON.parse(s.slice(debut, fin + 1)); } catch (e) { return null; }
}

function normaliser(j) {
  const vide = { lisible: false, type: 'autre', montant: null, libelle: null, date: null, confiance: 0 };
  if (!j || typeof j !== 'object') return vide;
  const type = ['recharge', 'lavage', 'autre'].includes(j.type) ? j.type : 'autre';
  let montant = Number(String(j.montant == null ? '' : j.montant).replace(/[^\d.]/g, ''));
  montant = isFinite(montant) && montant > 0 ? Math.round(montant) : null;
  const libelle = j.libelle ? String(j.libelle).trim().slice(0, 60) : null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(j.date || '')) ? j.date : null;
  const confiance = Math.max(0, Math.min(1, Number(j.confiance) || 0));
  const lisible = j.lisible !== false && montant != null;
  return { lisible, type, montant, libelle, date, confiance };
}

function lireBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;

  const apiKey = process.env.ANTHROPIC_API_KEY || '';

  if (req.method === 'GET') {
    return res.status(200).json({ configure: apiKey.length > 0, modele: MODEL });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorisé' });
  if (!apiKey) return res.status(503).json({ error: 'Lecture automatique non configurée (ANTHROPIC_API_KEY absente sur Vercel)' });

  const body = lireBody(req);
  const img = parseImage(body.image);
  const indice = body.type === 'recharge'
    ? ' Il s\'agit d\'un ticket de recharge électrique du véhicule (borne ou station) : le type est "recharge".'
    : body.type === 'imprevu'
      ? ' Il s\'agit d\'une dépense imprévue du chauffeur pendant son service (réparation, pièce, péage, parking, dépannage…) : le type est "autre" et le libellé décrit la nature de la dépense.'
      : '';
  if (!img) return res.status(400).json({ error: 'Image attendue en JPEG, PNG ou WebP (data URL base64)' });
  if (img.tooBig) return res.status(413).json({ error: 'Photo trop lourde (3 Mo max)' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0,
        system: CONSIGNE,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
            { type: 'text', text: 'Lis ce ticket et renvoie uniquement le JSON.' + indice },
          ],
        }],
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('charge-ocr: réponse Anthropic', r.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: 'Le service de lecture n\'a pas répondu' });
    }
    const texte = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const resultat = normaliser(extraireJson(texte));
    return res.status(200).json({ ...resultat, modele: MODEL });
  } catch (e) {
    console.error('charge-ocr:', e);
    return res.status(500).json({ error: 'Lecture impossible pour le moment' });
  }
};
