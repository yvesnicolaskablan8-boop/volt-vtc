/**
 * GET /api/yango/work-rules
 * Fetches all enabled work rules from Yango park
 */
const { verifyAuth, assertYangoCreds, yangoGet, setCors, handleOptions } = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
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
};
