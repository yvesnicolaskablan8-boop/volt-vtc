/**
 * WaveCron — Verification automatique des paiements Wave en attente
 *
 * Toutes les 5 minutes, verifie aupres de l'API Wave le statut
 * de tous les versements en_attente avec un waveCheckoutId.
 * Multi-tenant: itere sur tous les tenants actifs.
 */

const Versement = require('../models/Versement');
const Chauffeur = require('../models/Chauffeur');
const { getWaveApiKey } = require('./get-integration-keys');
const { forEachTenant } = require('./tenant-iterator');

let _interval = null;

function start() {
  console.log('[WaveCron] Demarrage — verification toutes les 5 minutes');

  // Premiere verification 30s apres le demarrage
  setTimeout(() => checkAllTenants(), 30000);

  // Puis toutes les 5 minutes
  _interval = setInterval(() => checkAllTenants(), 5 * 60 * 1000);
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

async function checkAllTenants() {
  await forEachTenant(async (entrepriseId) => {
    await checkPendingPayments(entrepriseId);
  });
}

async function checkPendingPayments(entrepriseId) {
  try {
    const waveApiKey = await getWaveApiKey(entrepriseId);
    if (!waveApiKey) return;

    // Trouver tous les versements Wave en attente pour ce tenant
    const filter = {
      statut: 'en_attente',
      waveCheckoutId: { $exists: true, $ne: null, $ne: '' }
    };
    if (entrepriseId) filter.entrepriseId = entrepriseId;

    const pending = await Versement.find(filter).lean();

    if (pending.length === 0) return;

    console.log(`[WaveCron] ${entrepriseId || 'global'}: ${pending.length} versement(s) Wave en attente a verifier`);

    for (const v of pending) {
      try {
        const waveRes = await fetch(`https://api.wave.com/v1/checkout/sessions/${v.waveCheckoutId}`, {
          headers: { 'Authorization': `Bearer ${waveApiKey}` }
        });

        if (!waveRes.ok) {
          console.warn(`[WaveCron] Erreur API Wave pour ${v.id}: HTTP ${waveRes.status}`);
          continue;
        }

        const session = await waveRes.json();

        if (session.payment_status === 'succeeded') {
          const chauffeur = await Chauffeur.findOne({ id: v.chauffeurId }).lean();
          const redevance = chauffeur ? (chauffeur.redevanceQuotidienne || 0) : 0;
          const montantEffectif = v.montantNet || v.montantBrut || 0;
          const manquant = (redevance > 0 && montantEffectif < redevance) ? redevance - montantEffectif : 0;
          const newStatut = (redevance > 0 && montantEffectif > 0 && montantEffectif < redevance) ? 'partiel' : 'valide';

          await Versement.updateOne({ id: v.id }, {
            statut: newStatut,
            montantVerse: v.montantNet || v.montantBrut,
            waveTransactionId: session.transaction_id || '',
            referencePaiement: session.transaction_id || '',
            dateValidation: new Date().toISOString(),
            manquant: manquant,
            traitementManquant: manquant > 0 ? 'dette' : null
          });

          console.log(`[WaveCron] Versement ${v.id} confirme → ${newStatut} (${montantEffectif} FCFA)`);

        } else if (session.checkout_status === 'expired' || session.payment_status === 'cancelled') {
          await Versement.deleteOne({ id: v.id });
          console.log(`[WaveCron] Versement ${v.id} supprime (${session.checkout_status || session.payment_status})`);
        }

      } catch (err) {
        console.warn(`[WaveCron] Erreur verification ${v.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[WaveCron] Erreur:', err.message);
  }
}

module.exports = { start, stop, checkPendingPayments };
