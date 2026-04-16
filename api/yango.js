/**
 * Consolidated Yango API — single serverless function
 * Routes via ?action=<name> to stay within Vercel Hobby plan limits.
 *
 * Actions:
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
} = require('./_lib/helpers');

// =================== INDIVIDUAL HANDLERS ===================

// ---------- test ----------
async function handleTest(req, res) {
  try {
    const { parkId } = assertYangoCreds();
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

    const { parkId } = assertYangoCreds();

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

    const { parkId } = assertYangoCreds();

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
          const driverId = o.driver?.id || o.performer?.driver_id;
          if (driverId !== yangoDriverId) return false;
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
          if (o.started_at && o.ended_at) {
            const dur = (new Date(o.ended_at) - new Date(o.started_at)) / 60000;
            if (dur > 0 && dur < 480) { // cap at 8h
              tempsActiviteMinutes += dur;
            }
          }
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
    const { parkId } = assertYangoCreds();
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
    const { parkId } = assertYangoCreds();

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
    const { parkId } = assertYangoCreds();
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
    const { parkId } = assertYangoCreds();
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
      const started = o.started_at ? new Date(o.started_at) : null;
      const ended = o.ended_at ? new Date(o.ended_at) : null;
      const dureeMinutes = (started && ended) ? Math.round((ended - started) / 60000) : 0;

      return {
        id: o.id,
        statut: o.status || 'unknown',
        chauffeurId: o.driver?.id || o.performer?.driver_id || '',
        chauffeurNom: [o.driver?.first_name, o.driver?.last_name].filter(Boolean).join(' ') || '',
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
    const { parkId } = assertYangoCreds();

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
    const { parkId } = assertYangoCreds();
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
    const { parkId } = assertYangoCreds();

    const data = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        driver_profile: ['id', 'first_name', 'last_name'],
        current_status: ['status']
      },
      limit: 300,
      offset: 0,
      query: { park: { id: parkId } }
    });

    const profiles = data.driver_profiles || [];
    const counts = { free: 0, busy: 0, in_order: 0, offline: 0 };
    const drivers = [];

    for (const p of profiles) {
      const dp = p.driver_profile || {};
      const status = (p.current_status || {}).status || 'offline';

      if (counts[status] !== undefined) counts[status]++;
      else counts.offline++;

      // Only include non-offline drivers in the list
      if (status !== 'offline') {
        drivers.push({
          id: dp.id,
          nom: [dp.first_name, dp.last_name].filter(Boolean).join(' '),
          status
        });
      }
    }

    const enLigne = counts.free + counts.busy + counts.in_order;

    res.json({
      counts,
      disponible: counts.free,
      commandeActive: counts.in_order,
      occupe: counts.busy,
      horsLigne: counts.offline,
      total: profiles.length,
      enLigne,
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
    const { parkId } = assertYangoCreds();
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
    const driverQuery = {
      park: {
        id: parkId,
        driver_profile: { work_status: ['working'] }
      }
    };
    if (workRuleIds.length) driverQuery.park.driver_profile.work_rule_id = workRuleIds;

    const driversData = await yangoFetch('/v1/parks/driver-profiles/list', {
      fields: {
        driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_rule_id'],
        current_status: ['status'],
        car: ['id', 'brand', 'model', 'number'],
        account: ['balance']
      },
      limit: 100,
      offset: 0,
      query: driverQuery
    });

    const profiles = driversData.driver_profiles || [];

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

    // Build driver list
    let enLigne = 0, occupes = 0, horsLigne = 0;
    const driversList = profiles.map(p => {
      const dp = p.driver_profile || {};
      const cs = (p.current_status || {}).status || 'offline';
      const balance = parseFloat(((p.accounts || [])[0] || {}).balance || 0);

      if (cs === 'free') enLigne++;
      else if (cs === 'busy' || cs === 'in_order') occupes++;
      else horsLigne++;

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

    const { parkId, apiKey, clientId } = assertYangoCreds();

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
    const { parkId } = assertYangoCreds();
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

    const from = `${targetDate}T00:00:00+00:00`;
    const to = `${targetDate}T23:59:59+00:00`;

    // 1) Get Pilote chauffeurs linked to Yango
    const chauffeurs = await supabaseQuery(
      'fleet_chauffeurs',
      'yango_driver_id=not.is.null&yango_driver_id=neq.&select=id,prenom,nom,yango_driver_id,vehicule_id',
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
      const driverOrders = allOrders.filter(o => {
        const dId = o.driver?.id || o.performer?.driver_id;
        return dId === yangoId;
      });
      const completed = driverOrders.filter(o => ['complete', 'finished'].includes(o.status));
      let activiteMinutes = 0;
      for (const o of completed) {
        if (o.started_at && o.ended_at) {
          const dur = (new Date(o.ended_at) - new Date(o.started_at)) / 60000;
          if (dur > 0 && dur < 480) activiteMinutes += dur;
        }
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
            vehicule_id: ch.vehicule_id || null,
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

          await fetch(`${SUPABASE_URL}/rest/v1/fleet_versements`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(versement)
          });
        } catch (e) {
          console.warn(`[sync] Versement upsert error for ${ch.id}:`, e.message);
        }
      }
    }

    res.json({
      success: true,
      date: targetDate,
      totalChauffeurs: chauffeurs.length,
      matched,
      matchedCount: matched,
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
};

module.exports = async function handler(req, res) {
  // CORS for every request
  setCors(res);
  if (handleOptions(req, res)) return;

  const action = req.query.action;

  if (!action) {
    return res.status(400).json({
      error: 'Parametre "action" manquant',
      actions: Object.keys(ACTION_MAP)
    });
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
