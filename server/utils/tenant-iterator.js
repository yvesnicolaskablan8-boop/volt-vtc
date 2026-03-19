/**
 * tenant-iterator.js
 *
 * Utility to iterate over all active tenants for cron jobs.
 */

const Entreprise = require('../models/Entreprise');

/**
 * Execute a callback for each active tenant.
 * @param {function(string, object)} callback - async function(entrepriseId, entreprise)
 */
async function forEachTenant(callback) {
  let tenants;
  try {
    tenants = await Entreprise.find({ statut: 'actif' }).lean();
  } catch (err) {
    // If Entreprise collection doesn't exist yet (pre-migration), run with null
    console.warn('[TenantIterator] Entreprise collection not found, running global');
    try {
      await callback(null, null);
    } catch (e) {
      console.error('[TenantIterator] Error (global):', e.message);
    }
    return;
  }

  if (!tenants || tenants.length === 0) {
    // No tenants yet — run once without scoping (backward compat)
    try {
      await callback(null, null);
    } catch (e) {
      console.error('[TenantIterator] Error (no tenants):', e.message);
    }
    return;
  }

  for (const tenant of tenants) {
    try {
      await callback(tenant.id, tenant);
    } catch (err) {
      console.error(`[TenantIterator] Error for ${tenant.id} (${tenant.nom}):`, err.message);
    }
  }
}

module.exports = { forEachTenant };
