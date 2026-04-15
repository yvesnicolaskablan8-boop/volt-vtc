const { withYango, yangoGet } = require('../_lib/yango');

module.exports = withYango(async (req, res, creds) => {
  const data = await yangoGet('/v1/parks/driver-work-rules', { park_id: creds.parkId }, creds);
  res.json({
    total: (data.work_rules || []).length,
    work_rules: (data.work_rules || []).map(r => ({ id: r.id, name: r.name })),
  });
});
