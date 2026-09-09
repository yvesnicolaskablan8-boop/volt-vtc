/**
 * Consolidated Yango API — single serverless function
 * Routes via ?action=<name> to stay within Vercel Hobby plan limits.
 *
 * Actions:
 *   GET  ?action=sync-ca        Ecrit le CA du jour de chaque chauffeur en base
 *   GET  ?action=test           Simple connection test
 *   GET  ?action=balance        Driver balance
 *   GET  ?action=driver-stats   Per-driver revenue + activity
 *   GET  ?action=work-rules     Enabled work rules
 *   GET  ?action=drivers        Active (working) drivers
 *   GET  ?action=drivers-all    All drivers for linking
 *   GET  ?action=orders         Orders for a date range
 *   GET  ?action=vehicles       Vehicles (single page)
 *   GET  ?action=vehicles-all   All vehicles for linking
 *   GET  ?action=fleet-status   Real-time fleet status
 *   GET  ?action=stats          Dashboard stats (drivers + orders + revenue)
 *   POST ?action=recharge       Recharge / debit a driver balance
 *   POST ?action=sync           Yango <-> Pilote data sync
 */
const {
  verifyAuth,
  getToken,
  setRequestToken,
  supabaseQuery,
  getYangoCreds,
  assertYangoCreds,
  yangoFetch,
  yangoGet,
  setCors,
  handleOptions,
  fetchAllTransactions,
  aggregateTransactions,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  YANGO_BASE,
  aggregateParChauffeur,
  orderDriverId,
  orderDurationMin,
  supabaseUpsert,
  isAdmin,
} = require('./_lib/helpers');

// ---------- sync-ca : CA quotidien Yango -> base ----------
/**
 * Ecrit le CA du jour de CHAQUE chauffeur dans fleet_ca_jour.
 *
 * C'est le maillon qui manquait : l'integration Yango etait en lecture seule,
 * donc l'application chauffeur n'avait aucune source pour l'objectif, le
 * surplus et les bonus — elle affichait 0 F a des chauffeurs qui avaient
 * travaille.
 *
 * Les transactions sont recuperees UNE fois puis agregees par chauffeur :
 * appeler driver-stats par chauffeur relirait tout le journal a chaque fois.
 */
async function handleSyncCa(req, res) {
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    await assertYangoCreds();
    const token = getToken(req);

    // Jour de reference : la date demandee, ou aujourd'hui (Abidjan = UTC+0).
    const jourRef = (req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jourRef)) {
      return res.status(400).json({ error: 'Date attendue au format AAAA-MM-JJ' });
    }
    // Nombre de jours a resynchroniser en remontant depuis jourRef (defaut 1).
    // INDISPENSABLE : une synchro « aujourd'hui » ne rattrape jamais les courses
    // du soir d'un jour deja ecoule. Sans backfill, le CA d'un jour passe restait
    // fige sur l'instantane partiel de la derniere synchro (ex. 41 000 a 14h52
    // au lieu des 77 800 reels en fin de journee) et sous-estimait la dette.
    const nbJours = Math.min(Math.max(parseInt(req.query.days || '1', 10) || 1, 1), 31);

    // Correspondance chauffeur Yango -> chauffeur Pilote (une seule fois).
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs', 'select=id,yango_driver_id&yango_driver_id=not.is.null', token);

    // Heure de bascule de la journee d'exploitation (Abidjan = UTC+0).
    // Les chauffeurs roulent au-dela de minuit : la journee du jour D couvre
    // [D 05h00, D+1 05h00). Une course a 2h du matin le lendemain appartient
    // donc a la nuit de travail de D. 05h00 = creux ou personne ne roule.
    const HEURE_BASCULE_JOUR = 5;

    const detailJours = [];
    let totalLignes = 0;
    let totalTransactions = 0;

    for (let i = 0; i < nbJours; i++) {
      const d = new Date(`${jourRef}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const jour = d.toISOString().slice(0, 10);
      // Fenetre = journee d'exploitation, pas journee calendaire.
      const debutJour = new Date(`${jour}T00:00:00Z`);
      debutJour.setUTCHours(HEURE_BASCULE_JOUR, 0, 0, 0);
      const finJour = new Date(debutJour);
      finJour.setUTCDate(finJour.getUTCDate() + 1);
      finJour.setUTCSeconds(finJour.getUTCSeconds() - 1); // 04:59:59 le lendemain (exclut la bascule suivante, pas de double comptage)
      const from = debutJour.toISOString().slice(0, 19) + '+00:00';
      const to   = finJour.toISOString().slice(0, 19) + '+00:00';

      const transactions = await fetchAllTransactions(from, to, 10);
      totalTransactions += transactions.length;
      const parYango = aggregateParChauffeur(transactions);

      const lignes = [];
      for (const ch of chauffeurs || []) {
        const a = parYango[ch.yango_driver_id];
        if (!a) continue;                       // aucune course ce jour-la
        lignes.push({
          id: `CA-${ch.id}-${jour}`,            // deterministe : reexecuter ne duplique pas
          chauffeur_id: ch.id,
          date: jour,
          ca_brut: Math.round(a.caBrut),
          commission_yango: Math.round(a.commissionYango),
          ca_net: Math.round(a.caNet),
          nb_courses: a.nbCourses,
          source: 'yango',
          maj_le: new Date().toISOString(),
        });
      }
      if (lignes.length) await supabaseUpsert('fleet_ca_jour', lignes, token, 'chauffeur_id,date');
      totalLignes += lignes.length;
      detailJours.push({ date: jour, chauffeurs: lignes.length, caTotal: lignes.reduce((s, l) => s + l.ca_brut, 0) });
    }

    res.json({
      success: true,
      date: jourRef,
      jours: nbJours,
      detailJours,
      chauffeursMisAJour: totalLignes,
      chauffeursLies: (chauffeurs || []).length,
      caTotal: detailJours.reduce((s, j) => s + j.caTotal, 0),
      transactionsLues: totalTransactions,
    });
  } catch (e) {
    console.error('[sync-ca]', e.message);
    res.status(500).json({ error: e.message });
  }
}

// =================== INDIVIDUAL HANDLERS ===================

// ---------- test ----------
async function handleTest(req, res) {
  try {
    const { parkId } = await assertYangoCreds();
    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      limit: 1,
      offset: 0,
      fields: { account: [], car: [], driver_profile: ['id'] },
      query: { park: { id: parkId } },
    });

    res.json({
      success: true,
      message: `Connexion reussie — ${data.total || 0} chauffeurs dans le parc`,
      total: data.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ---------- balance ----------
async function handleBalance(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const chauffeurId = req.query.chauffeurId;
    if (!chauffeurId) return res.status(400).json({ error: 'chauffeurId requis' });

    // Look up chauffeur in Supabase
    const token = getToken(req);
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs',
      `id=eq.${encodeURIComponent(chauffeurId)}&select=id,prenom,nom,yango_driver_id`,
      token
    );
    const chauffeur = chauffeurs[0];
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur introuvable' });
    if (!chauffeur.yango_driver_id) {
      return res.status(400).json({ error: "Ce chauffeur n'est pas lie a un profil Yango" });
    }

    const { parkId } = await assertYangoCreds();

    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        account: ['balance'],
        driver_profile: ['id']
      },
      limit: 1,
      offset: 0,
      query: {
        park: {
          id: parkId,
          driver_profile: {
            id: [chauffeur.yango_driver_id]
          }
        }
      }
    });

    const profile = (data.driver_profiles || [])[0];
    if (!profile) return res.status(404).json({ error: 'Profil Yango introuvable' });

    const account = (profile.accounts || [])[0] || {};
    const balance = parseFloat(account.balance || 0);
    const currency = account.currency || 'XOF';

    res.json({
      balance,
      currency,
      chauffeurId,
      yangoDriverId: chauffeur.yango_driver_id
    });

  } catch (err) {
    console.error('[Yango Balance] Error:', err.message);
    res.status(502).json({ error: 'Erreur lors de la recuperation du solde', details: err.message });
  }
}

// ---------- driver-stats ----------
async function handleDriverStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { yangoDriverId } = req.query;
    if (!yangoDriverId) return res.status(400).json({ error: 'yangoDriverId requis' });

    const { parkId } = await assertYangoCreds();

    // Default date range: today
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const from = req.query.from || `${todayStr}T00:00:00+00:00`;
    const to = req.query.to || now.toISOString();
    const isCustom = !!(req.query.from || req.query.to);

    // Safety timeout: 25 seconds max
    let partial = false;
    const safetyTimer = setTimeout(() => { partial = true; }, 25000);

    // 1) Fetch transactions
    let txAgg = { totalCA: 0, cash: 0, card: 0, commissionYango: 0, commissionPartenaire: 0 };
    let nbCourses = 0;
    let tempsActiviteMinutes = 0;

    try {
      if (!partial) {
        const allTx = await fetchAllTransactions(from, to, 5);
        txAgg = aggregateTransactions(allTx, yangoDriverId);
      }
    } catch (e) {
      console.warn('[driver-stats] Transactions error:', e.message);
    }

    // 2) Fetch orders for activity time
    try {
      if (!partial) {
        const ordersData = await yangoFetch('/v1/parks/orders/list', {
          limit: 500,
          query: {
            park: { id: parkId, order: {} }
          }
        });

        const orders = (ordersData.orders || []).filter(o => {
          if (orderDriverId(o) !== yangoDriverId) return false;
          const bookedAt = o.booked_at || '';
          return bookedAt >= from && bookedAt <= to;
        });

        // Count completed orders
        const completed = orders.filter(o =>
          ['complete', 'finished'].includes(o.status)
        );
        nbCourses = completed.length;

        // Sum activity time
        for (const o of completed) {
          tempsActiviteMinutes += orderDurationMin(o);
        }

        // Fallback: if transactions gave 0 revenue, use order prices
        if (txAgg.totalCA === 0 && completed.length > 0) {
          let cash = 0, card = 0;
          for (const o of completed) {
            const price = parseFloat(o.price || 0);
            if (o.payment_method === 'cash' || o.payment_method === '\u043d\u0430\u043b\u0438\u0447\u043d\u044b\u0435') {
              cash += price;
            } else {
              card += price;
            }
          }
          txAgg = { ...txAgg, totalCA: cash + card, cash, card };
        }
      }
    } catch (e) {
      console.warn('[driver-stats] Orders error:', e.message);
    }

    clearTimeout(safetyTimer);

    res.json({
      yangoDriverId,
      totalCA: Math.round(txAgg.totalCA),
      totalCash: Math.round(txAgg.cash),
      totalCard: Math.round(txAgg.card),
      nbCourses,
      commissionYango: Math.round(txAgg.commissionYango),
      commissionPartenaire: Math.round(txAgg.commissionPartenaire),
      tempsActiviteMinutes: Math.round(tempsActiviteMinutes),
      derniereMaj: new Date().toISOString(),
      periode: { from, to, isCustom },
      ...(partial ? { partial: true } : {})
    });

  } catch (err) {
    console.error('[driver-stats] Error:', err.message);
    res.status(502).json({ error: 'Erreur stats chauffeur', details: err.message });
  }
}

// ---------- work-rules ----------
async function handleWorkRules(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();
    const data = await yangoGet('/v1/parks/driver-work-rules', { park_id: parkId });

    const allRules = data.rules || data.work_rules || [];
    const enabled = allRules
      .filter(r => r.is_enabled !== false)
      .map(r => ({ id: r.id, name: r.name }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({ total: enabled.length, work_rules: enabled });

  } catch (err) {
    console.error('[work-rules] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- drivers ----------
function mapStatus(s) {
  if (s === 'free') return 'en_ligne';
  if (s === 'busy' || s === 'in_order') return 'occupe';
  return 'hors_ligne';
}

async function handleDrivers(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();

    // Build query
    const query = {
      park: {
        id: parkId,
        driver_profile: { work_status: ['working'] }
      }
    };

    // Optional work-rule filter
    const workRuleParam = req.query.work_rule;
    if (workRuleParam) {
      const ruleIds = workRuleParam.split(',').filter(Boolean);
      if (ruleIds.length) query.park.driver_profile.work_rule_id = ruleIds;
    }

    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        account: ['balance'],
        driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status', 'work_rule_id'],
        current_status: ['status'],
        car: ['id', 'brand', 'model', 'number']
      },
      limit: 100,
      offset: 0,
      query
    });

    // Fetch work-rule names for lookup
    let rulesMap = {};
    try {
      const rulesData = await yangoGet('/v1/parks/driver-work-rules', { park_id: parkId });
      const rules = rulesData.rules || rulesData.work_rules || [];
      for (const r of rules) { rulesMap[r.id] = r.name; }
    } catch { /* ignore */ }

    const profiles = data.driver_profiles || [];
    let online = 0, busy = 0, offline = 0;

    const drivers = profiles.map(p => {
      const dp = p.driver_profile || {};
      const cs = p.current_status || {};
      const car = p.car || {};
      const acc = (p.accounts || [])[0] || {};
      const status = mapStatus(cs.status);

      if (status === 'en_ligne') online++;
      else if (status === 'occupe') busy++;
      else offline++;

      return {
        id: dp.id,
        prenom: dp.first_name || '',
        nom: dp.last_name || '',
        telephone: (dp.phones || [])[0] || '',
        statut: status,
        statutRaw: cs.status || 'offline',
        workRuleId: dp.work_rule_id || '',
        workRuleName: rulesMap[dp.work_rule_id] || '',
        vehicule: car.id ? {
          id: car.id,
          marque: car.brand || '',
          modele: car.model || '',
          immatriculation: car.number || ''
        } : null,
        balance: parseFloat(acc.balance || 0)
      };
    });

    res.json({ total: drivers.length, drivers, online, busy, offline });

  } catch (err) {
    console.error('[drivers] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- drivers-all ----------
async function handleDriversAll(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();
    let allDrivers = [];
    const PAGE_SIZE = 300;
    const MAX_PAGES = 10;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status']
        },
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        query: { park: { id: parkId } }
      });

      const profiles = data.driver_profiles || [];
      for (const p of profiles) {
        const dp = p.driver_profile || {};
        allDrivers.push({
          id: dp.id,
          prenom: dp.first_name || '',
          nom: dp.last_name || '',
          telephone: (dp.phones || [])[0] || '',
          workStatus: dp.work_status || '',
          statut: dp.work_status || 'unknown'
        });
      }

      if (profiles.length < PAGE_SIZE) break;
    }

    res.json({ total: allDrivers.length, drivers: allDrivers });

  } catch (err) {
    console.error('[drivers-all] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- orders ----------
async function handleOrders(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const from = req.query.from || `${todayStr}T00:00:00+00:00`;
    const to = req.query.to || now.toISOString();

    const data = await yangoFetch('/v1/parks/orders/list', {
      limit: 100,
      query: {
        park: {
          id: parkId,
          order: {
            booked_at: { from, to }
          }
        }
      }
    });

    const orders = (data.orders || []).map(o => {
      const dureeMinutes = Math.round(orderDurationMin(o));

      return {
        id: o.id,
        statut: o.status || 'unknown',
        chauffeurId: orderDriverId(o) || '',
        chauffeurNom: (o.driver_profile && o.driver_profile.name) || [o.driver?.first_name, o.driver?.last_name].filter(Boolean).join(' ') || '',
        montant: parseFloat(o.price || 0),
        depart: o.route?.[0]?.fullname || o.source || '',
        arrivee: o.route?.[1]?.fullname || o.destination || '',
        dureeMinutes,
        dateReservation: o.booked_at || '',
        modePaiement: o.payment_method || ''
      };
    });

    const totalCA = orders.reduce((sum, o) => sum + o.montant, 0);
    const coursesEnCours = orders.filter(o =>
      ['driving', 'transporting', 'waiting'].includes(o.statut)
    ).length;

    res.json({ total: orders.length, orders, chiffreAffaires: totalCA, coursesEnCours });

  } catch (err) {
    console.error('[orders] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- vehicles ----------
async function handleVehicles(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();

    const data = await yangoFetch('/v1/parks/cars/list', {
      limit: 100,
      query: { park: { id: parkId } }
    });

    const vehicles = (data.cars || []).map(c => ({
      id: c.id,
      marque: c.brand || '',
      modele: c.model || '',
      couleur: c.color || '',
      immatriculation: c.number || '',
      annee: c.year || 0,
      statut: c.status || 'unknown',
      callsign: c.callsign || ''
    }));

    res.json({ total: vehicles.length, vehicles });

  } catch (err) {
    console.error('[vehicles] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- vehicles-all ----------
async function handleVehiclesAll(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();
    let allVehicles = [];
    const PAGE_SIZE = 100;
    const MAX_PAGES = 5;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await yangoFetch('/v1/parks/cars/list', {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        query: { park: { id: parkId } }
      });

      const cars = data.cars || [];
      for (const c of cars) {
        allVehicles.push({
          id: c.id,
          marque: c.brand || '',
          modele: c.model || '',
          immatriculation: c.number || '',
          couleur: c.color || '',
          annee: c.year || 0,
          statut: c.status || 'unknown'
        });
      }

      if (cars.length < PAGE_SIZE) break;
    }

    res.json({ total: allVehicles.length, vehicles: allVehicles });

  } catch (err) {
    console.error('[vehicles-all] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- fleet-status ----------
async function handleFleetStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();

    // Lecture EXACTE de drivers-all (tout le parc, sans filtre serveur, 300/page
    // × 10) : seule requête prouvée ramener les chauffeurs Pilote dans ce parc
    // très grand (le filtre work_status côté Yango + un plafond les laissaient
    // hors de portée → « 0 chauffeur »). working / isPilote sont appliqués ici.
    const PAGE = 300, MAX_PAGES = 10;
    let profiles = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          driver_profile: ['id', 'first_name', 'last_name', 'work_status'],
          current_status: ['status']
        },
        limit: PAGE,
        offset: page * PAGE,
        query: { park: { id: parkId } }
      });
      const batch = data.driver_profiles || [];
      profiles = profiles.concat(batch);
      if (batch.length < PAGE) break;
    }

    // Chauffeurs Pilote liés à Yango (jeton de l'appelant : RLS admin).
    const token = getToken(req);
    let piloteDrivers = [];
    try {
      piloteDrivers = await supabaseQuery(
        'fleet_chauffeurs',
        'yango_driver_id=not.is.null&yango_driver_id=neq.&select=id,prenom,nom,yango_driver_id,statut',
        token
      );
    } catch (e) {
      console.warn('[fleet-status] Supabase chauffeurs error:', e.message);
    }
    const piloteByYango = {};
    for (const c of piloteDrivers) {
      piloteByYango[c.yango_driver_id] = {
        chauffeurId: c.id,
        nom: `${c.prenom || ''} ${c.nom || ''}`.trim(),
        statutPilote: c.statut || ''
      };
    }

    // « En commande » FIABLE via l'API commandes (booked_at obligatoire) : course
    // active = statut non terminal. On retient l'ID du chauffeur pour marquer
    // chaque fiche individuellement.
    const enCommandeIds = new Set();
    try {
      const nowTs = new Date();
      const fromTs = new Date(nowTs.getTime() - 8 * 3600 * 1000);
      const ord = await yangoFetch('/v1/parks/orders/list', {
        limit: 500,
        query: { park: { id: parkId, order: { booked_at: { from: fromTs.toISOString(), to: nowTs.toISOString() } } } }
      });
      const TERMINAL = new Set(['complete', 'finished', 'cancelled', 'canceled', 'failed', 'expired', 'rejected', 'none']);
      for (const o of (ord.orders || [])) {
        if (!o.status || TERMINAL.has(o.status)) continue;
        const did = (o.performer && o.performer.driver_profile_id) || o.driver_profile_id;
        if (did) enCommandeIds.add(did);
      }
    } catch (e) { console.warn('[fleet-status] orders error:', e.message); }

    // Uniquement les chauffeurs Pilote « working », TOUS statuts inclus : le
    // dashboard doit aussi savoir qui est hors ligne.
    const counts = { free: 0, busy: 0, in_order: 0, offline: 0 };
    const drivers = [];
    for (const p of profiles) {
      const dp = p.driver_profile || {};
      if (dp.work_status !== 'working') continue;
      const pilote = piloteByYango[dp.id];
      if (!pilote) continue;
      const cs = p.current_status || {};
      let status = cs.status || 'offline';
      if (counts[status] === undefined) status = 'offline';
      const enCommande = enCommandeIds.has(dp.id);
      // Une course active prime : en commande même si Yango dit encore « busy ».
      if (enCommande && status !== 'in_order') status = 'in_order';
      counts[status]++;
      drivers.push({
        chauffeurId: pilote.chauffeurId,
        yangoId: dp.id,
        nom: pilote.nom,
        statutPilote: pilote.statutPilote,
        status,
        enCommande,
        statusTs: cs.status_updated_ts || null
      });
    }

    res.json({
      total: drivers.length,
      counts,
      disponible: counts.free,
      occupe: counts.busy,
      commandeActive: counts.in_order,
      horsLigne: counts.offline,
      enLigne: counts.free + counts.busy + counts.in_order,
      drivers
    });

  } catch (err) {
    console.error('[fleet-status] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- stats ----------
async function handleStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();
    const token = getToken(req);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Date range
    const from = req.query.from || `${todayStr}T00:00:00+00:00`;
    const to = req.query.to || now.toISOString();

    // Month range (1st of current month to now)
    const monthFrom = `${todayStr.slice(0, 7)}-01T00:00:00+00:00`;
    const monthTo = now.toISOString();

    // Work-rule filter
    const workRuleParam = req.query.work_rule;
    const workRuleIds = workRuleParam ? workRuleParam.split(',').filter(Boolean) : [];

    // =================== 1) DRIVERS ===================
    // On lit EXACTEMENT ce que lit drivers-all (tout le parc, sans filtre
    // serveur, 300/page, 10 pages) : c'est la seule requête dont on a la preuve
    // qu'elle ramène les chauffeurs Pilote (vérifié le 09/09 : les 8 ids stockés
    // sont bien présents et « working »). Le filtre work_status côté Yango,
    // combiné au plafond de lecture, les laissait hors de portée dans ce parc
    // très grand → « 0 chauffeur ». Les filtres working / catégorie sont donc
    // appliqués ici, côté Pilote.
    const PAGE = 300, MAX_PAGES = 10;
    let profiles = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const driversData = await yangoFetch('/v1/parks/driver-profiles/list', {
        fields: {
          driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_rule_id', 'work_status'],
          current_status: ['status'],
          car: ['id', 'brand', 'model', 'number'],
          account: ['balance']
        },
        limit: PAGE,
        offset: page * PAGE,
        query: { park: { id: parkId } }
      });
      const batch = driversData.driver_profiles || [];
      profiles = profiles.concat(batch);
      if (batch.length < PAGE) break;
    }
    profiles = profiles.filter(p => {
      const dp = p.driver_profile || {};
      if (dp.work_status !== 'working') return false;
      if (workRuleIds.length && !workRuleIds.includes(dp.work_rule_id)) return false;
      return true;
    });

    // =================== 2) PILOTE chauffeurs (from Supabase) ===================
    let piloteDrivers = [];
    try {
      piloteDrivers = await supabaseQuery(
        'fleet_chauffeurs',
        'yango_driver_id=not.is.null&yango_driver_id=neq.&select=id,prenom,nom,yango_driver_id',
        token
      );
    } catch (e) {
      console.warn('[stats] Supabase chauffeurs error:', e.message);
    }

    const piloteYangoIds = new Set(piloteDrivers.map(c => c.yango_driver_id));
    const piloteNameMap = {};
    for (const c of piloteDrivers) {
      piloteNameMap[c.yango_driver_id] = `${c.prenom || ''} ${c.nom || ''}`.trim();
    }

    // Build driver list — statuts comptés sur les SEULS chauffeurs Pilote, pour
    // que total / dispo / occupés / hors ligne décrivent la même population.
    // (Avant : statuts comptés sur tout le parc mais total après filtre → « -3 ».)
    const driversList = profiles.map(p => {
      const dp = p.driver_profile || {};
      const cs = (p.current_status || {}).status || 'offline';
      const balance = parseFloat(((p.accounts || [])[0] || {}).balance || 0);
      const isPilote = piloteYangoIds.has(dp.id);
      const nom = isPilote ? piloteNameMap[dp.id] : [dp.first_name, dp.last_name].filter(Boolean).join(' ');

      return {
        id: dp.id,
        nom,
        statut: cs,
        balance,
        isPilote,
        workRuleId: dp.work_rule_id || ''
      };
    }).filter(d => d.isPilote); // Only show Pilote-linked drivers

    let enLigne = 0, occupes = 0, horsLigne = 0;
    for (const d of driversList) {
      if (d.statut === 'free') enLigne++;
      else if (d.statut === 'busy' || d.statut === 'in_order') occupes++;
      else horsLigne++;
    }

    // =================== 3) ORDERS (today) ===================
    let coursesAujourdhui = 0, coursesEnCours = 0, coursesTerminees = 0, coursesAnnulees = 0;
    let coursesMois = 0;

    try {
      const ordersData = await yangoFetch('/v1/parks/orders/list', {
        limit: 100,
        query: { park: { id: parkId, order: { booked_at: { from, to } } } }
      });
      const orders = ordersData.orders || [];
      coursesAujourdhui = orders.length;
      coursesEnCours = orders.filter(o => ['driving', 'transporting', 'waiting'].includes(o.status)).length;
      coursesTerminees = orders.filter(o => ['complete', 'finished'].includes(o.status)).length;
      coursesAnnulees = orders.filter(o => o.status === 'cancelled').length;
    } catch (e) {
      console.warn('[stats] Orders error:', e.message);
    }

    // Orders for the month (skip if custom range)
    if (!req.query.from) {
      try {
        const monthOrders = await yangoFetch('/v1/parks/orders/list', {
          limit: 100,
          query: { park: { id: parkId, order: { booked_at: { from: monthFrom, to: monthTo } } } }
        });
        coursesMois = (monthOrders.orders || []).length;
      } catch { /* ignore */ }
    }

    // =================== 4) TRANSACTIONS (revenue) ===================
    let todayAgg = { totalCA: 0, cash: 0, card: 0, commissionYango: 0, commissionPartenaire: 0 };
    let monthAgg = { totalCA: 0, cash: 0, card: 0, commissionYango: 0, commissionPartenaire: 0 };

    try {
      const todayTx = await fetchAllTransactions(from, to, 5);
      todayAgg = aggregateTransactions(todayTx);
    } catch (e) {
      console.warn('[stats] Transactions error:', e.message);
    }

    if (!req.query.from) {
      try {
        const monthTx = await fetchAllTransactions(monthFrom, monthTo, 10);
        monthAgg = aggregateTransactions(monthTx);
      } catch { /* ignore */ }
    }

    // =================== 5) TOP CHAUFFEURS ===================
    const topChauffeurs = driversList
      .filter(d => d.balance !== 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)
      .map(d => ({ id: d.id, nom: d.nom, balance: d.balance }));

    // =================== RESPONSE ===================
    res.json({
      chauffeurs: {
        total: driversList.length,
        enLigne,
        occupes,
        horsLigne,
        liste: driversList
      },
      courses: {
        aujourd_hui: coursesAujourdhui,
        mois: coursesMois || coursesAujourdhui,
        enCours: coursesEnCours,
        terminees: coursesTerminees,
        annulees: coursesAnnulees
      },
      chiffreAffaires: {
        aujourd_hui: Math.round(todayAgg.totalCA),
        mois: Math.round(monthAgg.totalCA),
        cash: {
          aujourd_hui: Math.round(todayAgg.cash),
          mois: Math.round(monthAgg.cash)
        },
        card: {
          aujourd_hui: Math.round(todayAgg.card),
          mois: Math.round(monthAgg.card)
        }
      },
      commissionYango: {
        aujourd_hui: Math.round(todayAgg.commissionYango),
        mois: Math.round(monthAgg.commissionYango)
      },
      commissionPartenaire: {
        aujourd_hui: Math.round(todayAgg.commissionPartenaire),
        mois: Math.round(monthAgg.commissionPartenaire)
      },
      topChauffeurs,
      derniereMaj: new Date().toISOString(),
      periode: { from, to }
    });

  } catch (err) {
    console.error('[stats] Error:', err.message);
    res.status(502).json({ error: 'Erreur stats dashboard', details: err.message });
  }
}

// ---------- recharge ----------
async function handleRecharge(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { chauffeurId, amount, description } = req.body;

    if (!chauffeurId || !amount) {
      return res.status(400).json({ error: 'chauffeurId et amount requis' });
    }

    const montant = parseFloat(amount);
    if (isNaN(montant) || montant === 0) {
      return res.status(400).json({ error: 'Le montant doit etre un nombre non nul' });
    }

    // Look up chauffeur in Supabase
    const token = getToken(req);
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs',
      `id=eq.${encodeURIComponent(chauffeurId)}&select=id,prenom,nom,yango_driver_id`,
      token
    );
    const chauffeur = chauffeurs[0];
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur introuvable' });
    if (!chauffeur.yango_driver_id) {
      return res.status(400).json({ error: "Ce chauffeur n'est pas lie a un profil Yango" });
    }

    const { parkId, apiKey, clientId } = await assertYangoCreds();

    // Idempotency token
    const idempotencyToken = `pilote-recharge-${chauffeurId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const body = {
      amount: montant.toFixed(4),
      category_id: 'partner_service_manual',
      description: description || `Recharge Pilote — ${chauffeur.prenom} ${chauffeur.nom}`,
      driver_profile_id: chauffeur.yango_driver_id,
      park_id: parkId
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${YANGO_BASE}/v2/parks/driver-profiles/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': clientId,
        'X-API-Key': apiKey,
        'X-Idempotency-Token': idempotencyToken,
        'Accept-Language': 'fr'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: `Erreur Yango: ${response.status}`,
        details: text.substring(0, 300)
      });
    }

    let result;
    try { result = JSON.parse(text); } catch { result = { raw: text.substring(0, 200) }; }

    res.json({
      success: true,
      message: `${montant > 0 ? 'Recharge' : 'Debit'} de ${Math.abs(montant)} XOF effectue pour ${chauffeur.prenom} ${chauffeur.nom}`,
      transaction: result,
      idempotencyToken
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout — Yango API ne repond pas' });
    }
    console.error('[Yango Recharge] Error:', err.message);
    res.status(502).json({ error: 'Erreur lors de la recharge', details: err.message });
  }
}

// ---------- sync ----------
async function handleSync(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const { parkId } = await assertYangoCreds();
    const token = getToken(req);
    const syncDate = req.body?.date || null;

    // Determine date range
    let targetDate;
    if (syncDate) {
      targetDate = syncDate;
    } else {
      // Default: yesterday
      const d = new Date();
      d.setDate(d.getDate() - 1);
      targetDate = d.toISOString().slice(0, 10);
    }

    // Journée d'exploitation : 5 h → 5 h le lendemain (le travail continue après minuit,
    // les courses de 0 h à 5 h comptent pour la veille). Abidjan = UTC.
    const _next = new Date(`${targetDate}T00:00:00Z`); _next.setUTCDate(_next.getUTCDate() + 1);
    const from = `${targetDate}T05:00:00+00:00`;
    const to = `${_next.toISOString().slice(0, 10)}T04:59:59+00:00`;

    // 1) Get Pilote chauffeurs linked to Yango
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs',
      'yango_driver_id=not.is.null&yango_driver_id=neq.&select=id,prenom,nom,yango_driver_id,vehicule_assigne',
      token
    );

    if (!chauffeurs.length) {
      return res.json({ success: true, message: 'Aucun chauffeur lie a Yango', matched: 0 });
    }

    // 2) Fetch all transactions for the target date
    const transactions = await fetchAllTransactions(from, to, 5);

    // 3) Fetch orders for activity time
    let allOrders = [];
    try {
      const ordersData = await yangoFetch('/v1/parks/orders/list', {
        limit: 500,
        query: { park: { id: parkId, order: { booked_at: { from, to } } } }
      });
      allOrders = ordersData.orders || [];
    } catch { /* ignore */ }

    // 4) Match: for each Pilote chauffeur, compute their Yango stats
    let matched = 0;
    const results = [];

    for (const ch of chauffeurs) {
      const yangoId = ch.yango_driver_id;
      const agg = aggregateTransactions(transactions, yangoId);

      // Count orders and activity time
      const driverOrders = allOrders.filter(o => orderDriverId(o) === yangoId);
      const completed = driverOrders.filter(o => ['complete', 'finished'].includes(o.status));
      let activiteMinutes = 0;
      for (const o of completed) {
        activiteMinutes += orderDurationMin(o);
      }

      if (agg.totalCA > 0 || completed.length > 0) {
        matched++;
        results.push({
          chauffeurId: ch.id,
          nom: `${ch.prenom || ''} ${ch.nom || ''}`.trim(),
          yangoDriverId: yangoId,
          totalCA: Math.round(agg.totalCA),
          nbCourses: completed.length,
          activiteMinutes: Math.round(activiteMinutes),
          cash: Math.round(agg.cash),
          card: Math.round(agg.card)
        });

        // 5) Upsert versement in Supabase
        try {
          const versementId = `YANGO-${ch.id}-${targetDate}`;
          const versement = {
            id: versementId,
            chauffeur_id: ch.id,
            vehicule_id: ch.vehicule_assigne || null,
            date: targetDate,
            montant: Math.round(agg.totalCA),
            montant_cash: Math.round(agg.cash),
            montant_carte: Math.round(agg.card),
            commission_yango: Math.round(agg.commissionYango),
            nb_courses: completed.length,
            temps_activite: Math.round(activiteMinutes),
            source: 'yango_sync',
            statut: 'valide',
            updated_at: new Date().toISOString()
          };

          const up = await fetch(`${SUPABASE_URL}/rest/v1/fleet_versements`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(versement)
          });
          // Un 400 PostgREST (colonne inconnue…) ne lève pas d'exception : on le
          // vérifie explicitement, sinon la synchro déclarait « success » sans
          // avoir rien écrit.
          if (!up.ok) {
            const t = await up.text();
            throw new Error(`Supabase ${up.status}: ${t.substring(0, 200)}`);
          }
          results[results.length - 1].ecrit = true;
        } catch (e) {
          results[results.length - 1].ecrit = false;
          results[results.length - 1].erreurEcriture = e.message;
          console.warn(`[sync] Versement upsert error for ${ch.id}:`, e.message);
        }
      }
    }

    // Bilan d'écriture explicite : `matched` compte les chauffeurs avec activité,
    // pas les versements réellement enregistrés.
    const ecrits = results.filter(r => r.ecrit === true).length;
    const erreursEcriture = results.filter(r => r.ecrit === false).length;
    res.json({
      success: true,
      date: targetDate,
      totalChauffeurs: chauffeurs.length,
      matched,
      matchedCount: matched,
      ecrits,
      erreursEcriture,
      results
    });

  } catch (err) {
    console.error('[sync] Error:', err.message);
    if (err.message?.includes('credentials')) {
      return res.status(503).json({ error: 'Yango credentials non configurees', details: err.message });
    }
    res.status(502).json({ error: 'Erreur sync Yango', details: err.message });
  }
}

// =================== ROUTER ===================


// =================== RAPPORT CA REEL PAR CHAUFFEUR ===================
// Agrege le CA Yango par chauffeur sur une periode, avec le nombre de jours
// reellement travailles -> donne le CA MOYEN PAR JOUR, le chiffre qui decide
// si un chauffeur peut etre salarie (seuil de rentabilite ~62 000 F/jour).
async function handleCaReport(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });

  try {
    const jours = Math.min(parseInt(req.query.jours || '30', 10) || 30, 90);
    const now = new Date();
    const debut = new Date(now.getTime() - jours * 86400000);
    const from = req.query.from || debut.toISOString();
    const to = req.query.to || now.toISOString();

    const allTx = await fetchAllTransactions(from, to, 10);

    const CASH_CATS = ['cash_collected', 'partner_ride_cash_collected'];
    const CARD_CATS = ['card', 'partner_ride_card', 'ewallet_payment', 'terminal_payment'];
    const YANGO_CATS = ['platform_ride_fee', 'platform_ride_vat'];

    // Repartition horaire de l'activite. La Cote d'Ivoire est a UTC+0 :
    // l'heure lue dans event_at est donc directement l'heure locale.
    const parHeure = Array.from({ length: 24 }, () => ({ ca: 0, courses: 0, jours: new Set() }));

    // Agregation par chauffeur, en gardant la trace des jours actifs
    const parChauffeur = {};
    for (const tx of allTx) {
      const id = tx.driver_profile_id;
      if (!id) continue;
      const cat = tx.category_id || '';
      const montant = parseFloat(tx.amount || 0);
      const jour = (tx.event_at || '').slice(0, 10);

      if (!parChauffeur[id]) {
        parChauffeur[id] = { yangoDriverId: id, totalCA: 0, cash: 0, card: 0, commissionYango: 0, joursActifs: new Set(), parJour: {} };
      }
      const c = parChauffeur[id];

      let estCourse = false;
      if (CASH_CATS.includes(cat)) { c.cash += montant; estCourse = true; }
      else if (CARD_CATS.includes(cat)) { c.card += montant; estCourse = true; }
      else if (YANGO_CATS.includes(cat)) { c.commissionYango += Math.abs(montant); }

      if (estCourse && jour) {
        const h = parseInt(String(tx.event_at || '').slice(11, 13), 10);
        if (!isNaN(h) && h >= 0 && h < 24) {
          parHeure[h].ca += montant;
          parHeure[h].courses++;
          parHeure[h].jours.add(jour);
        }
        c.joursActifs.add(jour);
        if (!c.parJour[jour]) c.parJour[jour] = { ca: 0, n: 0, min: null, max: null };
        const d = c.parJour[jour];
        d.ca += montant;
        d.n++;
        const t = tx.event_at;
        if (t) {
          if (!d.min || t < d.min) d.min = t;
          if (!d.max || t > d.max) d.max = t;
        }
      }
    }

    // Heures cible d'une journee de travail complete, pour la projection
    const heuresCible = Math.min(Math.max(parseFloat(req.query.heures || '10') || 10, 4), 16);

    const chauffeurs = Object.values(parChauffeur).map(c => {
      const totalCA = c.cash + c.card;
      const nbJours = c.joursActifs.size;

      // Amplitude d'activite : de la premiere a la derniere course du jour.
      // Sous-estime le temps de connexion (l'attente avant la 1re course n'est
      // pas visible), mais c'est la mesure la plus fiable disponible.
      let heuresTotal = 0, caMesure = 0, joursMesures = 0;
      const parJour = [];
      for (const [date, d] of Object.entries(c.parJour)) {
        parJour.push({ date, ca: Math.round(d.ca), courses: d.n });
        if (d.n >= 2 && d.min && d.max) {
          const h = (new Date(d.max) - new Date(d.min)) / 3600000;
          if (h >= 0.5) { heuresTotal += h; caMesure += d.ca; joursMesures++; }
        }
      }
      parJour.sort((a, b) => a.date.localeCompare(b.date));
      const meilleurJour = parJour.reduce((m, j) => (j.ca > (m ? m.ca : 0) ? j : m), null);

      const caParHeure = heuresTotal > 0 ? caMesure / heuresTotal : 0;
      const amplitudeMoyenne = joursMesures > 0 ? heuresTotal / joursMesures : 0;

      return {
        yangoDriverId: c.yangoDriverId,
        totalCA: Math.round(totalCA),
        cash: Math.round(c.cash),
        card: Math.round(c.card),
        commissionYango: Math.round(c.commissionYango),
        joursActifs: nbJours,
        caMoyenJour: nbJours > 0 ? Math.round(totalCA / nbJours) : 0,
        // Productivite reelle, independante du temps passe en ligne
        caParHeure: Math.round(caParHeure),
        amplitudeMoyenne: Math.round(amplitudeMoyenne * 10) / 10,
        joursMesures,
        potentielJour: Math.round(caParHeure * heuresCible),
        meilleurJour,
        parJour
      };
    }).filter(c => c.totalCA > 0).sort((a, b) => b.caMoyenJour - a.caMoyenJour);

    // Synthese horaire + extrapolation de la nuit a partir de la tranche
    // reellement observee (22h-00h). Au-dela, les donnees refletent la
    // consigne interne de ne pas rouler apres minuit, pas la demande reelle.
    const repartitionHoraire = parHeure.map((h, i) => ({
      heure: i,
      ca: Math.round(h.ca),
      courses: h.courses,
      joursActifs: h.jours.size,
      caMoyenParJour: h.jours.size > 0 ? Math.round(h.ca / h.jours.size) : 0
    }));

    const joursSoiree = new Set([...parHeure[22].jours, ...parHeure[23].jours]).size;
    const caSoiree = parHeure[22].ca + parHeure[23].ca;
    const caParHeureSoiree = joursSoiree > 0 ? caSoiree / (joursSoiree * 2) : 0;
    const caApresMinuit = [0, 1, 2, 3, 4].reduce((sum, h) => sum + parHeure[h].ca, 0);

    const nuit = {
      caParHeureSoiree: Math.round(caParHeureSoiree),
      joursObserves: joursSoiree,
      caSoiree: Math.round(caSoiree),
      caApresMinuitObserve: Math.round(caApresMinuit),
      // 22h-05h = 7 heures, projetees a la productivite de la soiree
      projectionNuitComplete: Math.round(caParHeureSoiree * 7),
      biaisConnu: caApresMinuit < caSoiree * 0.1
    };

    return res.status(200).json({
      periode: { from, to, jours },
      heuresCible,
      nbTransactions: allTx.length,
      chauffeurs,
      repartitionHoraire,
      nuit
    });
  } catch (e) {
    console.error('[ca-report] error:', e.message);
    return res.status(500).json({ error: 'Erreur rapport CA', details: e.message });
  }
}

// ---------- online-status ----------
// Statut « en ligne » temps réel via l'API supply-hours (temps de mise à
// disposition). Pour chaque chauffeur demandé (ids = contractor_profile_id),
// on regarde s'il a été en ligne dans les 10 dernières minutes → en ligne.
async function handleOnlineStatus(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });
  try {
    await assertYangoCreds();
    const idsParam = (req.query.ids || '').trim();
    const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 40) : [];
    if (!ids.length) return res.json({ enLigne: 0, checked: 0, drivers: [] });

    const now = new Date();
    const from = new Date(now.getTime() - 15 * 60 * 1000); // 15 dernières minutes (présence récente)
    const results = await Promise.allSettled(ids.map(id =>
      yangoGet('/v2/parks/contractors/supply-hours', {
        contractor_profile_id: id,
        period_from: from.toISOString(),
        period_to: now.toISOString()
      }).then(r => ({ id, seconds: Number(r && r.supply_duration_seconds) || 0 }))
    ));
    const drivers = results.map((r, i) => r.status === 'fulfilled' ? r.value : { id: ids[i], seconds: 0, error: (r.reason && r.reason.message) || 'err' });
    const enLigne = drivers.filter(d => d.seconds > 0).length;
    res.json({ enLigne, checked: ids.length, drivers });
  } catch (err) {
    console.error('[online-status] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

// ---------- suivi de course (orders/track) ----------
// Position temps réel du chauffeur qui exécute une commande ACTIVE. Nécessite
// le droit « Récupération d'un suivi de course/livraison » sur la clé API.
// Le format de réponse Yango n'étant pas documenté publiquement, on renvoie une
// position normalisée (dernier point trouvé) ET la charge brute pour ajuster.
async function handleOrderTrack(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await verifyAuth(req);
  if (!user) return res.status(401).json({ error: 'Non autorise' });
  try {
    const { parkId } = await assertYangoCreds();
    const orderId = (req.query.orderId || '').trim();
    if (!orderId) return res.status(400).json({ error: 'Parametre "orderId" manquant' });

    const raw = await yangoFetch('/v1/parks/orders/track', {
      query: { park: { id: parkId }, order: { id: orderId } }
    });

    // Dernier point : tableau `track` (le plus récent en fin) ou objet position.
    const pts = Array.isArray(raw && raw.track) ? raw.track : (raw && raw.position ? [raw.position] : []);
    const last = pts.length ? pts[pts.length - 1] : (raw && (raw.lat != null || raw.latitude != null) ? raw : null);
    const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
    const position = last ? {
      lat: num(last.lat != null ? last.lat : last.latitude),
      lng: num(last.lon != null ? last.lon : (last.lng != null ? last.lng : last.longitude)),
      at: last.timestamp || last.at || last.time || null,
      speed: num(last.speed)
    } : null;

    res.json({ orderId, position, status: (raw && raw.status) || null, raw });
  } catch (err) {
    console.error('[order-track] Error:', err.message);
    res.status(502).json({ error: 'Erreur API Yango', details: err.message });
  }
}

const ACTION_MAP = {
  'test':          handleTest,
  'balance':       handleBalance,
  'driver-stats':  handleDriverStats,
  'work-rules':    handleWorkRules,
  'drivers':       handleDrivers,
  'drivers-all':   handleDriversAll,
  'orders':        handleOrders,
  'vehicles':      handleVehicles,
  'vehicles-all':  handleVehiclesAll,
  'fleet-status':  handleFleetStatus,
  'stats':         handleStats,
  'recharge':      handleRecharge,
  'sync':          handleSync,
  'ca-report':     handleCaReport,
  'sync-ca':       handleSyncCa,
  'online-status': handleOnlineStatus,
  'order-track':   handleOrderTrack,
};

module.exports = async function handler(req, res) {
  // CORS for every request
  setCors(res);
  if (handleOptions(req, res)) return;

  // Jeton de l'appelant pour les lectures Supabase (RLS : authenticated only)
  setRequestToken(getToken(req));

  const action = req.query.action;

  if (!action) {
    return res.status(400).json({
      error: 'Parametre "action" manquant',
      actions: Object.keys(ACTION_MAP)
    });
  }

  // Toutes les fonctions Yango relevent de l'administration : donnees de la
  // flotte entiere, statistiques de revenus, et « recharge » qui engage de
  // l'argent. Un chauffeur authentifie ne doit atteindre aucune d'elles.
  if (!(await isAdmin(req))) {
    return res.status(403).json({ error: 'Reserve a l\'administration' });
  }

  const handlerFn = ACTION_MAP[action];
  if (!handlerFn) {
    return res.status(400).json({
      error: `Action inconnue: "${action}"`,
      actions: Object.keys(ACTION_MAP)
    });
  }

  return handlerFn(req, res);
};
