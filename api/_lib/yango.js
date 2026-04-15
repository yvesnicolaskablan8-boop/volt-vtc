/**
 * Shared Yango Fleet API helpers for Vercel serverless functions.
 * Reads credentials from Supabase fleet_settings, calls Yango API.
 */

const SUPABASE_URL = 'https://cnwigcbgzzwvvihopvto.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud2lnY2Jnenp3dnZpaG9wdnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTMzNTksImV4cCI6MjA5MTY2OTM1OX0.v9L44YLNpphKZZyMHSrDa9bYaxtZMqaF5BsEKtg9NH8';
const YANGO_BASE = 'https://fleet-api.yango.tech';

// Cache credentials for 60 seconds
let _credCache = null;
let _credTime = 0;

async function getYangoCredentials() {
  const now = Date.now();
  if (_credCache && (now - _credTime) < 60000) return _credCache;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/fleet_settings?select=integrations&order=created_at.desc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const rows = await res.json();

  // Find the row that has yango credentials filled
  for (const row of rows) {
    const y = row?.integrations?.yango;
    if (y && y.parkId && y.apiKey) {
      _credCache = { parkId: y.parkId, apiKey: y.apiKey, clientId: y.clientId || '' };
      _credTime = now;
      return _credCache;
    }
  }
  return null;
}

/**
 * Make a POST request to Yango Fleet API
 */
async function yangoPost(endpoint, body, creds, { timeout = 25000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${YANGO_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-ID': creds.clientId,
        'X-API-Key': creds.apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Yango API ${res.status}: ${text.substring(0, 200)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Yango API timeout');
    throw err;
  }
}

/**
 * Make a GET request to Yango Fleet API
 */
async function yangoGet(endpoint, params, creds) {
  const url = new URL(`${YANGO_BASE}${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      'X-Client-ID': creds.clientId,
      'X-API-Key': creds.apiKey,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Yango API ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

/**
 * CORS headers helper
 */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Standard handler wrapper with credential loading + CORS + error handling
 */
function withYango(handler) {
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
      const creds = await getYangoCredentials();
      if (!creds) {
        return res.status(400).json({ error: 'Yango API credentials not configured' });
      }
      await handler(req, res, creds);
    } catch (err) {
      console.error('[Yango API]', err.message);
      res.status(500).json({ error: err.message });
    }
  };
}

module.exports = { getYangoCredentials, yangoPost, yangoGet, cors, withYango, YANGO_BASE };
