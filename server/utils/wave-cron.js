/**
 * WaveCron — Verification automatique des paiements Wave en attente
 *
 * Toutes les 5 minutes, verifie aupres de l'API Wave le statut
 * de tous les versements en_attente avec un waveCheckoutId.
 * Remplace le webhook Wave quand celui-ci n'est pas disponible.
 */

const Versement = require('../models/Versement');
const Chauffeur = require('../models/Chauffeur');
const { getWaveApiKey } = require('./get-integration-keys');

let _interval = null;

function start() {
  console.log('[WaveCron] Demarrage — verification toutes les 5 minutes');

  // Premiere verification 30s apres le demarrage
  setTimeout(() => checkPendingPayments(), 30000);

  // Puis toutes les 5 minutes
  _interval = setInterval(() => checkPendingPayments(), 5 * 60 * 1000);
}

function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

async function checkPendingPayments() {
  try {
    const waveApiKey = await getWaveApiKey();
    if (!waveApiKey) {
      console.log('[WaveCron] WAVE_API_KEY non configuree — verification ignoree');
      return;
    }

    // Trouver tous les versements Wave en attente
    const pending = await Versement.find({
      statut: 'en_attente',
      waveCheckoutId: { $exists: true, $ne: null, $ne: '' }
    }).lean();

    if (pending.length === 0) return;

    console.log(`[WaveCron] ${pending.length} versement(s) Wave en attente a verifier`);

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
          // Paiement confirme — mettre a jour le versement
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
          // Session expiree ou annulee — supprimer le versement fantome
          await Versement.deleteOne({ id: v.id });
          console.log(`[WaveCron] Versement ${v.id} supprime (${session.checkout_status || session.payment_status})`);
        }
        // Sinon (pending) — on reessaiera dans 5 minutes

      } catch (err) {
        console.warn(`[WaveCron] Erreur verification ${v.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[WaveCron] Erreur globale:', err.message);
  }
}

module.exports = { start, stop, checkPendingPayments };
