/**
 * GET /api/yango/stats?work_rule=ID1,ID2&from=ISO&to=ISO
 * Main dashboard stats: drivers, orders, revenue, commissions
 * This is the most complex endpoint — combines drivers + orders + transactions
 */
const {
  verifyAuth, getToken, assertYangoCreds, yangoFetch, yangoGet,
  supabaseQuery, fetchAllTransactions, aggregateTransactions,
  setCors, handleOptions
} = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
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
};
