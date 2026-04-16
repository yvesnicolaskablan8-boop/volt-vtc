/**
 * Shared helpers for Vercel Serverless Functions
 * - Supabase auth verification
 * - Supabase REST queries
 * - Yango Fleet API helpers (POST + GET with retries)
 */

const SUPABASE_URL = 'https://cnwigcbgzzwvvihopvto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud2lnY2Jnenp3dnZpaG9wdnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTMzNTksImV4cCI6MjA5MTY2OTM1OX0.v9L44YLNpphKZZyMHSrDa9bYaxtZMqaF5BsEKtg9NH8';
const YANGO_BASE = 'https://fleet-api.taxi.yandex.net';

// =================== AUTH ===================

async function verifyAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      }
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function getToken(req) {
  return req.headers.authorization?.replace('Bearer ', '') || '';
}

// =================== SUPABASE REST ===================

async function supabaseQuery(table, params = '', token = null) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

// =================== YANGO CREDENTIALS ===================

function getYangoCreds() {
  return {
    parkId: process.env.YANGO_PARK_ID || '',
    apiKey: process.env.YANGO_API_KEY || '',
    clientId: process.env.YANGO_CLIENT_ID || '',
  };
}

function assertYangoCreds() {
  const creds = getYangoCreds();
  if (!creds.parkId || !creds.apiKey || !creds.clientId) {
    throw new Error('Yango API credentials not configured — set YANGO_PARK_ID, YANGO_API_KEY, YANGO_CLIENT_ID env vars');
  }
  return creds;
}

// =================== YANGO POST (with retries) ===================

async function yangoFetch(endpoint, body = {}, maxRetries = 3) {
  const { apiKey, clientId } = assertYangoCreds();
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(`${YANGO_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientId,
          'X-API-Key': apiKey,
          'Accept-Language': 'fr'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const text = await res.text();

      if (!res.ok) {
        if (res.status >= 500 && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        throw new Error(`Yango API error ${res.status}: ${text.substring(0, 200)}`);
      }

      try { return JSON.parse(text); }
      catch { throw new Error(`Yango API invalid JSON: ${text.substring(0, 200)}`); }

    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError' && attempt < maxRetries) continue;
      if (attempt < maxRetries && e.message?.includes('API error 5')) continue;
      throw e;
    }
  }
  throw lastError;
}

// =================== YANGO GET ===================

async function yangoGet(endpoint, params = {}) {
  const { parkId, apiKey, clientId } = assertYangoCreds();

  const url = new URL(`${YANGO_BASE}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-Client-ID': clientId,
      'X-API-Key': apiKey,
      'X-Park-ID': parkId,
      'Accept-Language': 'fr'
    },
    signal: controller.signal
  });
  clearTimeout(timeout);

  const text = await res.text();
  if (!res.ok) throw new Error(`Yango API error ${res.status}: ${text.substring(0, 200)}`);

  try { return JSON.parse(text); }
  catch { throw new Error(`Yango API invalid JSON: ${text.substring(0, 200)}`); }
}

// =================== CORS + METHOD ===================

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.status(200).end();
    return true;
  }
  return false;
}

// =================== TRANSACTIONS HELPER ===================

/**
 * Fetch all transactions from Yango with cursor-based pagination
 */
async function fetchAllTransactions(from, to, maxPages = 10) {
  const { parkId } = assertYangoCreds();
  let allItems = [];
  let cursor = null;

  for (let page = 0; page < maxPages; page++) {
    const body = {
      query: {
        park: { id: parkId, transaction: {} }
      },
      limit: 1000
    };

    if (from) body.query.park.transaction.event_at = { from };
    if (to) body.query.park.transaction.event_at = {
      ...body.query.park.transaction.event_at,
      to
    };
    if (cursor) body.cursor = cursor;

    const data = await yangoFetch('/v2/parks/transactions/list', body);
    const items = data.transactions || [];
    allItems = allItems.concat(items);

    cursor = data.cursor;
    if (!cursor || items.length < 1000) break;
  }
  return allItems;
}

// =================== AGGREGATE TRANSACTIONS ===================

function aggregateTransactions(transactions, filterDriverId = null) {
  let cash = 0, card = 0, commissionYango = 0, commissionPartenaire = 0;

  const CASH_CATS = ['cash_collected', 'partner_ride_cash_collected'];
  const CARD_CATS = ['card', 'partner_ride_card', 'ewallet_payment', 'terminal_payment'];
  const YANGO_CATS = ['platform_ride_fee', 'platform_ride_vat'];
  const PARTNER_CAT = 'partner_ride_fee';

  for (const tx of transactions) {
    if (filterDriverId && tx.driver_profile_id !== filterDriverId) continue;

    const cat = tx.category_id || '';
    const amount = parseFloat(tx.amount || 0);

    if (CASH_CATS.includes(cat)) cash += amount;
    else if (CARD_CATS.includes(cat)) card += amount;
    else if (YANGO_CATS.includes(cat)) commissionYango += Math.abs(amount);
    else if (cat === PARTNER_CAT) commissionPartenaire += Math.abs(amount);
  }

  return {
    totalCA: cash + card,
    cash,
    card,
    commissionYango,
    commissionPartenaire
  };
}

module.exports = {
  verifyAuth,
  getToken,
  supabaseQuery,
  getYangoCreds,
  assertYangoCreds,
  yangoFetch,
  yangoGet,
  setCors,
  handleOptions,
  fetchAllTransactions,
  aggregateTransactions,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  YANGO_BASE,
};
