/**
 * GET /api/yango/balance?chauffeurId=xxx
 * Fetches the Yango account balance for a driver
 */
const { verifyAuth, getToken, supabaseQuery, assertYangoCreds, yangoFetch, setCors, handleOptions } = require('../_lib/helpers');

module.exports = async function handler(req, res) {
  setCors(res);
  if (handleOptions(req, res)) return;
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
};
