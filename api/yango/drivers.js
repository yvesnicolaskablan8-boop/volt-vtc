const { withYango, yangoPost } = require('../_lib/yango');

module.exports = withYango(async (req, res, creds) => {
  const workRuleFilter = req.query.work_rule ? req.query.work_rule.split(',') : [];
  const all = req.query.all === '1'; // /api/yango/drivers?all=1 for linking

  const body = {
    limit: 300,
    offset: 0,
    fields: {
      account: ['balance', 'currency'],
      car: ['brand', 'model', 'color', 'number', 'year'],
      driver_profile: ['id', 'first_name', 'last_name', 'phones', 'work_status', 'work_rule_id', 'hire_date', 'created_date'],
      current_status: ['status'],
    },
    query: { park: { id: creds.parkId } },
  };

  if (!all) {
    body.query.park.work_status = ['working'];
    if (workRuleFilter.length) {
      body.query.park.work_rule_id = workRuleFilter;
    }
  }

  const data = await yangoPost('/v1/parks/driver-profiles/list', body, creds);
  const profiles = data.driver_profiles || [];

  let online = 0, busy = 0, offline = 0;
  const drivers = profiles.map(p => {
    const dp = p.driver_profile || {};
    const acc = p.accounts || [];
    const car = p.car || {};
    const status = (p.current_status || {}).status || 'offline';

    if (status === 'free') online++;
    else if (status === 'busy' || status === 'in_order') busy++;
    else offline++;

    return {
      id: dp.id,
      prenom: dp.first_name || '',
      nom: dp.last_name || '',
      telephone: (dp.phones || [])[0] || '',
      statut: status === 'free' ? 'En ligne' : status === 'busy' || status === 'in_order' ? 'Occupe' : 'Hors ligne',
      workStatus: dp.work_status,
      workRuleId: dp.work_rule_id,
      balance: acc[0]?.balance || '0',
      devise: acc[0]?.currency || 'XOF',
      vehicule: {
        marque: car.brand || '',
        modele: car.model || '',
        couleur: car.color || '',
        immatriculation: car.number || '',
        annee: car.year || '',
      },
    };
  });

  res.json({ total: data.total || drivers.length, drivers, online, busy, offline });
});
