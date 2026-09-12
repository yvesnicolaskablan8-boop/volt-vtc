/**
 * Analyse IA de l'activité — page « Analyse IA » de l'espace de gestion.
 *
 *   POST /api/analyse  { periode: '7j' | '30j' | 'mois', mode: 'kpis' | 'analyse' | 'question', question?: string }
 *   → { periode, kpis, chauffeurs, vehicules, serie, aVenir, analyse, reponse, configure, modele, erreur? }
 *
 * Réservé aux administrateurs (RPC fleet_is_admin). Les chiffres sont calculés ici,
 * de façon déterministe, à partir des tables fleet_* lues avec la session de
 * l'utilisateur (RLS respectée). Claude ne fait qu'interpréter ce tableau de bord
 * (mode « analyse ») ou répondre à une question dessus (mode « question »).
 *
 * Variables Vercel : ANTHROPIC_API_KEY (pour les modes analyse / question),
 *                    ANALYSE_MODEL (facultatif, défaut claude-sonnet-5).
 */
const { isAdmin, getToken, supabaseQuery, setCors, handleOptions } = require('./_lib/helpers');

const MODEL = process.env.ANALYSE_MODEL || 'claude-sonnet-5';
const MODEL_REPLI = 'claude-haiku-4-5-20251001'; // utilisé si le modèle principal est refusé par l'API
const TEST_IDS = /^CHF-TEST/i;

// ---------- dates ----------
function iso(d) { return d.toISOString().slice(0, 10); }
function addJours(dateIso, n) { const d = new Date(dateIso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function joursEntre(du, au) { return Math.round((Date.parse(au + 'T00:00:00Z') - Date.parse(du + 'T00:00:00Z')) / 86400000) + 1; }

function bornes(periode) {
  // Journée d'exploitation 05h→05h (Abidjan = UTC) : avant 05h, « aujourd'hui » est la veille.
  const now = new Date();
  if (now.getUTCHours() < 5) now.setUTCDate(now.getUTCDate() - 1);
  const au = iso(now);
  let du;
  if (periode === '7j') du = addJours(au, -6);
  else if (periode === 'mois') du = au.slice(0, 7) + '-01';
  else du = addJours(au, -29);
  return { du, au, jours: joursEntre(du, au), aVenirJusqu: addJours(au, 7), libelle: periode === '7j' ? '7 derniers jours' : periode === 'mois' ? 'mois en cours' : '30 derniers jours' };
}

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r0 = (v) => Math.round(v);
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);

// ---------- lecture + calculs ----------
async function construireSnapshot(token, periode) {
  const b = bornes(periode);
  const [chauffeurs, vehicules, caJour, versements, charges, planning, absences, contraventions] = await Promise.all([
    supabaseQuery('fleet_chauffeurs', 'select=id,prenom,nom,statut,type_contrat,salaire_mensuel,date_debut_contrat,vehicule_assigne,jour_repos,jour_repos2', token),
    supabaseQuery('fleet_vehicules', 'select=id,immatriculation,marque,modele,statut,type_acquisition,mensualite_leasing,consommation,cout_energie,kilometrage_mensuel', token),
    supabaseQuery('fleet_ca_jour', `select=chauffeur_id,date,ca_brut,ca_net,commission_yango,nb_courses&date=gte.${b.du}&date=lte.${b.au}`, token),
    supabaseQuery('fleet_versements', `select=chauffeur_id,date,date_service,statut,montant_verse,traitement_manquant,manquant&date=gte.${b.du}&date=lte.${b.au}`, token),
    supabaseQuery('fleet_charges', `select=chauffeur_id,date,type,montant&date=gte.${b.du}&date=lte.${b.au}`, token),
    supabaseQuery('fleet_planning', `select=chauffeur_id,date,vehicule_id,type_creneaux&date=gte.${b.du}&date=lte.${b.aVenirJusqu}`, token),
    supabaseQuery('fleet_absences', 'select=chauffeur_id,date_debut,date_fin', token),
    supabaseQuery('fleet_contraventions', 'select=chauffeur_id,montant,statut&statut=eq.impayee', token),
  ]);

  const actifs = chauffeurs.filter(c => c.statut !== 'inactif' && !TEST_IDS.test(c.id));
  const chById = new Map(chauffeurs.map(c => [c.id, c]));
  const vehById = new Map(vehicules.map(v => [v.id, v]));
  const cle = (id, d) => `${id}|${String(d).slice(0, 10)}`;

  const caIdx = new Map();
  caJour.forEach(e => caIdx.set(cle(e.chauffeur_id, e.date), { brut: n(e.ca_brut), net: n(e.ca_net) || n(e.ca_brut) - n(e.commission_yango), commission: n(e.commission_yango), courses: n(e.nb_courses) }));
  const verseIdx = new Map();  // versé valide/partiel
  const neutreIdx = new Set(); // supprime / perte : journée neutralisée
  versements.forEach(v => {
    const k = cle(v.chauffeur_id, v.date_service || v.date);
    if (v.statut === 'valide' || v.statut === 'partiel') verseIdx.set(k, (verseIdx.get(k) || 0) + n(v.montant_verse));
    if (v.statut === 'supprime' || v.statut === 'perte' || v.traitement_manquant === 'perte') neutreIdx.add(k);
  });
  const chargesIdx = new Map();
  charges.forEach(c => chargesIdx.set(cle(c.chauffeur_id, c.date), (chargesIdx.get(cle(c.chauffeur_id, c.date)) || 0) + n(c.montant)));
  const absent = (id, d) => absences.some(a => a.chauffeur_id === id && d >= String(a.date_debut).slice(0, 10) && d <= String(a.date_fin).slice(0, 10));

  const planPasse = planning.filter(p => p.date <= b.au);
  const planFutur = planning.filter(p => p.date > b.au);
  const planIdx = new Map();
  planPasse.forEach(p => { const k = cle(p.chauffeur_id, p.date); if (!planIdx.has(k)) planIdx.set(k, p); });

  // ----- par chauffeur -----
  const parChauffeur = actifs.map(c => {
    const nom = `${c.prenom || ''} ${c.nom || ''}`.trim();
    let joursCA = 0, caBrut = 0, caNet = 0, courses = 0, verse = 0, joursPlanifies = 0, joursNonVerses = 0, nonVerseEstime = 0, charges = 0;
    const jours = new Set();
    caIdx.forEach((e, k) => { if (k.startsWith(c.id + '|')) { jours.add(k); if (e.brut > 0) { joursCA++; caBrut += e.brut; caNet += e.net; courses += e.courses; } } });
    verseIdx.forEach((v, k) => { if (k.startsWith(c.id + '|')) verse += v; });
    chargesIdx.forEach((v, k) => { if (k.startsWith(c.id + '|')) charges += v; });
    planIdx.forEach((p, k) => {
      if (p.chauffeur_id !== c.id) return;
      const d = k.split('|')[1];
      if (absent(c.id, d)) return;
      joursPlanifies++;
      if (!verseIdx.has(k) && !neutreIdx.has(k)) {
        joursNonVerses++;
        const e = caIdx.get(k);
        if (e && e.net > 0) nonVerseEstime += Math.max(0, e.net - (chargesIdx.get(k) || 0));
      }
    });
    const contra = contraventions.filter(x => x.chauffeur_id === c.id);
    return {
      id: c.id, nom, type: c.type_contrat || 'location', statut: c.statut, salaire: n(c.salaire_mensuel), debut: c.date_debut_contrat || null,
      joursCA, caBrut: r0(caBrut), caNet: r0(caNet), courses, verse: r0(verse), taux: pct(verse, caNet), charges: r0(charges),
      joursPlanifies, joursNonVerses, nonVerseEstime: r0(nonVerseEstime),
      caNetParJour: joursCA ? r0(caNet / joursCA) : 0,
      contraventionsImpayees: contra.length, contraventionsMontant: r0(contra.reduce((s, x) => s + n(x.montant), 0)),
    };
  }).sort((a, b2) => b2.caNet - a.caNet);

  // ----- totaux -----
  const tot = parChauffeur.reduce((s, c) => ({
    caBrut: s.caBrut + c.caBrut, caNet: s.caNet + c.caNet, verse: s.verse + c.verse, courses: s.courses + c.courses,
    joursCA: s.joursCA + c.joursCA, joursPlanifies: s.joursPlanifies + c.joursPlanifies, joursNonVerses: s.joursNonVerses + c.joursNonVerses,
    nonVerseEstime: s.nonVerseEstime + c.nonVerseEstime, charges: s.charges + c.charges,
  }), { caBrut: 0, caNet: 0, verse: 0, courses: 0, joursCA: 0, joursPlanifies: 0, joursNonVerses: 0, nonVerseEstime: 0, charges: 0 });

  // ----- véhicules et coûts estimés -----
  const vehPlanifies = [...new Set(planPasse.map(p => p.vehicule_id).filter(Boolean))];
  const prorata = b.jours / 30;
  const salaries = actifs.filter(c => c.type_contrat === 'salarie');
  const salaires = r0(salaries.reduce((s, c) => {
    let part = prorata;
    if (c.date_debut_contrat && c.date_debut_contrat > b.du) part = Math.max(0, joursEntre(c.date_debut_contrat, b.au)) / 30;
    return s + n(c.salaire_mensuel) * part;
  }, 0));
  const vehs = vehPlanifies.map(id => vehById.get(id)).filter(Boolean);
  const leasing = r0(vehs.reduce((s, v) => s + (v.type_acquisition === 'leasing' ? n(v.mensualite_leasing) : 0), 0) * prorata);
  const energie = r0(vehs.reduce((s, v) => s + n(v.kilometrage_mensuel) * (n(v.consommation) / 100) * n(v.cout_energie), 0) * prorata);
  const couts = salaires + leasing + energie;
  const jvParVoitureJour = vehPlanifies.length ? +(tot.joursPlanifies / (vehPlanifies.length * b.jours)).toFixed(2) : null;

  // ----- série par jour -----
  const serieIdx = new Map();
  for (let d = b.du; d <= b.au; d = addJours(d, 1)) serieIdx.set(d, { date: d, caNet: 0, verse: 0, joursChauffeur: 0 });
  caIdx.forEach((e, k) => { const [id, d] = k.split('|'); const s = serieIdx.get(d); if (s && chById.has(id) && !TEST_IDS.test(id) && e.brut > 0) { s.caNet += e.net; s.joursChauffeur++; } });
  verseIdx.forEach((v, k) => { const [id, d] = k.split('|'); const s = serieIdx.get(d); if (s && !TEST_IDS.test(id)) s.verse += v; });
  const serie = [...serieIdx.values()].map(s => ({ ...s, caNet: r0(s.caNet), verse: r0(s.verse) }));

  // ----- planning à venir (7 jours) -----
  const aVenirIdx = new Map();
  planFutur.forEach(p => aVenirIdx.set(p.date, (aVenirIdx.get(p.date) || 0) + 1));
  const aVenir = [...aVenirIdx.entries()].sort().map(([date, chauffeurs]) => ({ date, chauffeurs }));

  const derniereSynchro = caJour.reduce((m, e) => (String(e.date) > m ? String(e.date).slice(0, 10) : m), '');

  return {
    periode: { du: b.du, au: b.au, jours: b.jours, libelle: b.libelle },
    kpis: {
      chauffeursActifs: actifs.length, salaries: salaries.length, locations: actifs.length - salaries.length,
      vehiculesFlotte: vehicules.filter(v => v.statut !== 'inactif').length, vehiculesPlanifies: vehPlanifies.length,
      caBrut: tot.caBrut, caNet: tot.caNet, commission: tot.caBrut - tot.caNet, courses: tot.courses,
      verse: tot.verse, tauxEncaissement: pct(tot.verse, tot.caNet), nonVerseEstime: tot.nonVerseEstime,
      joursChauffeur: tot.joursCA, joursPlanifies: tot.joursPlanifies, joursNonVerses: tot.joursNonVerses,
      caNetParJourChauffeur: tot.joursCA ? r0(tot.caNet / tot.joursCA) : 0,
      joursChauffeurParVoitureJour: jvParVoitureJour,
      charges: tot.charges,
      couts: { salaires, leasing, energie, total: couts, note: 'Estimation : salaires au prorata, leasing et énergie des seuls véhicules planifiés ; hors assurance, entretien et structure.' },
      resultatSurEncaisse: tot.verse - couts, resultatSiToutEncaisse: tot.caNet - couts,
      contraventionsImpayees: contraventions.length, contraventionsMontant: r0(contraventions.reduce((s, x) => s + n(x.montant), 0)),
      derniereSynchroCA: derniereSynchro || null,
    },
    chauffeurs: parChauffeur,
    vehicules: vehs.map(v => ({ id: v.id, immatriculation: v.immatriculation, modele: `${v.marque || ''} ${v.modele || ''}`.trim(), acquisition: v.type_acquisition, leasingMensuel: n(v.mensualite_leasing) })),
    serie, aVenir,
  };
}

// ---------- Claude ----------
const SYSTEME = `Tu es l'analyste de gestion de Pilote, une flotte de VTC électriques à Abidjan (Côte d'Ivoire). Les chauffeurs sont salariés (salaire fixe mensuel) et versent chaque jour à l'entreprise la recette Yango nette de la journée moins leurs dépenses justifiées ; l'entreprise supporte le leasing des voitures, l'énergie, l'entretien. Montants en francs CFA (écris « F » ou « FCFA », jamais €).
Règles :
- Tu ne t'appuies QUE sur les données JSON fournies. Si une information manque, dis-le au lieu de l'inventer.
- Sois concret : cite les chauffeurs par leur nom, donne les montants et les taux, compare aux ordres de grandeur utiles (un jour-chauffeur rapporte en moyenne X F net ; une voiture en leasing coûte Y F par jour).
- Le levier n°1 est le taux d'encaissement (versé / CA net) ; le n°2 est l'utilisation des voitures (jours-chauffeur par voiture et par jour, l'objectif étant 2 en double service) ; le n°3 le CA net par jour-chauffeur.
- Les coûts sont des estimations partielles (voir la note) : précise-le quand tu parles de résultat.
- Écris en français, en Markdown, sans emoji, phrases courtes, chiffres arrondis au millier.`;

const CONSIGNE_ANALYSE = `Rédige l'analyse de la période avec exactement ces sections :
## Diagnostic
Trois phrases maximum : la santé de l'activité en un coup d'œil.
## Ce qui va bien
Deux à quatre puces, avec chiffres.
## Points d'attention
Trois à cinq puces, classées par impact financier, avec les chauffeurs concernés et les montants.
## Recommandations
Trois à cinq actions concrètes, ordonnées par impact, chacune en une ou deux phrases avec l'effet attendu chiffré quand c'est possible.
## Données à vérifier
Une à trois puces sur ce qui semble incomplet ou incohérent dans les données (synchronisation, planning, fiches).`;

async function demanderClaude(apiKey, snapshot, consigne, modele = MODEL) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: modele, max_tokens: 1800, temperature: 0.2, system: SYSTEME,
      messages: [{ role: 'user', content: `Données de la période (JSON) :\n${JSON.stringify(snapshot)}\n\n${consigne}` }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const type = data && data.error && data.error.type || '';
    const detail = data && data.error && data.error.message || `HTTP ${r.status}`;
    console.error('analyse: réponse Anthropic', r.status, modele, JSON.stringify(data).slice(0, 300));
    // Modèle inconnu ou non accessible pour cette clé : on retente avec le modèle de repli.
    if (modele !== MODEL_REPLI && (r.status === 404 || type === 'not_found_error')) {
      return demanderClaude(apiKey, snapshot, consigne, MODEL_REPLI);
    }
    if (r.status === 401 || type === 'authentication_error') throw new Error('Clé Anthropic refusée (ANTHROPIC_API_KEY invalide ou révoquée) : ' + detail);
    if (r.status === 429 || r.status === 402 || type === 'rate_limit_error' || /credit|billing/i.test(detail)) throw new Error('Compte Anthropic : ' + detail);
    throw new Error(`Service d’analyse (${modele}) : ${detail}`);
  }
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
}

function lireBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Réservé aux administrateurs' });

  const body = lireBody(req);
  const periode = ['7j', '30j', 'mois'].includes(body.periode) ? body.periode : '30j';
  const mode = ['kpis', 'analyse', 'question'].includes(body.mode) ? body.mode : 'kpis';
  const apiKey = process.env.ANTHROPIC_API_KEY || '';

  let snapshot;
  try {
    snapshot = await construireSnapshot(getToken(req), periode);
  } catch (e) {
    console.error('analyse: lecture', e);
    return res.status(500).json({ error: 'Lecture des données impossible : ' + (e.message || e) });
  }

  const reponse = { ...snapshot, configure: apiKey.length > 0, modele: MODEL, analyse: null, reponse: null };
  if (mode === 'kpis') return res.status(200).json(reponse);
  if (!apiKey) return res.status(200).json({ ...reponse, erreur: 'Analyse IA non configurée : ajoutez la variable ANTHROPIC_API_KEY sur Vercel.' });

  try {
    if (mode === 'analyse') {
      reponse.analyse = await demanderClaude(apiKey, snapshot, CONSIGNE_ANALYSE);
    } else {
      const question = String(body.question || '').trim().slice(0, 600);
      if (!question) return res.status(400).json({ error: 'Question vide' });
      reponse.reponse = await demanderClaude(apiKey, snapshot, `Question du gestionnaire : « ${question} »\nRéponds en 200 mots maximum, en Markdown, avec les chiffres utiles tirés des données. Si les données ne permettent pas de répondre, dis-le.`);
    }
    return res.status(200).json(reponse);
  } catch (e) {
    console.error('analyse:', e);
    return res.status(502).json({ ...reponse, erreur: e.message || 'Analyse impossible pour le moment' });
  }
};
