/**
 * get-integration-keys.js
 *
 * Centralized helper to read API keys from MongoDB Settings (DB-first),
 * falling back to process.env if nothing stored in DB.
 * Per-tenant cache (Map keyed by entrepriseId), TTL 60 seconds.
 */

const Settings = require('../models/Settings');

const _cache = new Map(); // key: entrepriseId || '__global__', value: { data, time }
const CACHE_TTL = 60 * 1000; // 60 seconds

async function _getIntegrations(entrepriseId) {
  const cacheKey = entrepriseId || '__global__';
  const now = Date.now();
  const cached = _cache.get(cacheKey);
  if (cached && (now - cached.time) < CACHE_TTL) {
    return cached.data;
  }
  try {
    const filter = entrepriseId ? { entrepriseId } : {};
    const settings = await Settings.findOne(filter).lean();
    const data = settings?.integrations || {};
    _cache.set(cacheKey, { data, time: now });
    return data;
  } catch (err) {
    console.error('[IntegrationKeys] Erreur lecture DB:', err.message);
    return _cache.get(cacheKey)?.data || {};
  }
}

/**
 * Clear cache (call after saving new keys so they take effect immediately)
 */
function clearCache(entrepriseId) {
  if (entrepriseId) {
    _cache.delete(entrepriseId);
  } else {
    _cache.clear();
  }
}

/**
 * Get Wave API key (DB first, then .env fallback)
 * @param {string|null} entrepriseId - tenant ID (null for legacy/global)
 */
async function getWaveApiKey(entrepriseId) {
  const integrations = await _getIntegrations(entrepriseId);
  return integrations?.wave?.apiKey || process.env.WAVE_API_KEY || '';
}

/**
 * Get Yango credentials (DB first, then .env fallback)
 * @param {string|null} entrepriseId - tenant ID (null for legacy/global)
 */
async function getYangoCredentials(entrepriseId) {
  const integrations = await _getIntegrations(entrepriseId);
  const yango = integrations?.yango || {};
  return {
    parkId: yango.parkId || process.env.YANGO_PARK_ID || '',
    apiKey: yango.apiKey || process.env.YANGO_API_KEY || '',
    clientId: yango.clientId || process.env.YANGO_CLIENT_ID || ''
  };
}

module.exports = { getWaveApiKey, getYangoCredentials, clearCache };
