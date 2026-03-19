/**
 * get-integration-keys.js
 *
 * Centralized helper to read API keys from MongoDB Settings (DB-first),
 * falling back to process.env if nothing stored in DB.
 * Cached for 60 seconds to avoid hitting DB on every API call.
 */

const Settings = require('../models/Settings');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

async function _getIntegrations() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) {
    return _cache;
  }
  try {
    const settings = await Settings.findOne().lean();
    _cache = settings?.integrations || {};
    _cacheTime = now;
    return _cache;
  } catch (err) {
    console.error('[IntegrationKeys] Erreur lecture DB:', err.message);
    return _cache || {};
  }
}

/**
 * Clear cache (call after saving new keys so they take effect immediately)
 */
function clearCache() {
  _cache = null;
  _cacheTime = 0;
}

/**
 * Get Wave API key (DB first, then .env fallback)
 */
async function getWaveApiKey() {
  const integrations = await _getIntegrations();
  return integrations?.wave?.apiKey || process.env.WAVE_API_KEY || '';
}

/**
 * Get Yango credentials (DB first, then .env fallback)
 */
async function getYangoCredentials() {
  const integrations = await _getIntegrations();
  const yango = integrations?.yango || {};
  return {
    parkId: yango.parkId || process.env.YANGO_PARK_ID || '',
    apiKey: yango.apiKey || process.env.YANGO_API_KEY || '',
    clientId: yango.clientId || process.env.YANGO_CLIENT_ID || ''
  };
}

module.exports = { getWaveApiKey, getYangoCredentials, clearCache };
