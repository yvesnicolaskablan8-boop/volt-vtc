const { withYango, yangoPost } = require('../_lib/yango');

module.exports = withYango(async (req, res, creds) => {
  const data = await yangoPost('/v1/parks/driver-profiles/list', {
    limit: 500,
    offset: 0,
    park_id: creds.parkId,
    fields: {
      driver_profile: ['id', 'first_name', 'last_name'],
      current_status: ['status'],
    },
  }, creds);

  const profiles = data.driver_profiles || [];
  const counts = { free: 0, busy: 0, in_order: 0, offline: 0, total: profiles.length };

  profiles.forEach(p => {
    const s = (p.current_status || {}).status || 'offline';
    if (counts[s] !== undefined) counts[s]++;
    else counts.offline++;
  });

  res.json({
    counts,
    disponible: counts.free,
    commandeActive: counts.in_order,
    occupe: counts.busy,
    horsLigne: counts.offline,
    total: counts.total,
    enLigne: counts.free + counts.busy + counts.in_order,
  });
});
