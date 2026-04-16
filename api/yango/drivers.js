/**
 * GET /api/yango/drivers?work_rule=ID1,ID2
 * Lists active (working) drivers from Yango with optional work-rule filter
 */
const { verifyAuth, assertYangoCreds, yangoFetch, yangoGet, setCors, handleOptions } = require('../_lib/helpers');

function mapStatus(s) {
  if (s === 'free') return 'en_ligne';
  if (s === 'busy' || s === 'in_order') return 'occupe';
  return 'hors_ligne';
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
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
};
