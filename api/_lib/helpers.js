/**
 * Shared helpers for Vercel Serverless Functions
 * - Supabase auth verification
 * - Supabase REST queries
 * - Yango Fleet API helpers (POST + GET with retries)
 */

const SUPABASE_URL = 'https://cnwigcbgzzwvvihopvto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNud2lnY2Jnenp3dnZpaG9wdnRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTMzNTksImV4cCI6MjA5MTY2OTM1OX0.v9L44YLNpphKZZyMHSrDa9bYaxtZMqaF5BsEKtg9NH8';
const YANGO_BASE = 'https://fleet-api.yango.tech';

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

/**
 * Verifie que l'appelant est ADMINISTRATEUR, pas seulement authentifie.
 * verifyAuth ne controle que la validite du jeton : un chauffeur connecte
 * passait donc toutes les fonctions Yango, y compris « recharge », qui
 * deplace de l'argent.
 * S'appuie sur fleet_is_admin() cote base, deja utilisee par les regles RLS.
 */
async function isAdmin(req) {
  const token = getToken(req);
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fleet_is_admin`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
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

// Jeton de la requête en cours (JWT de l'admin appelant, déjà validé par
// verifyAuth). RLS n'autorise plus la clé anon à lire fleet_settings : la
// lecture des credentials se fait donc avec le jeton authenticated de
// l'appelant. Posé par le handler principal à chaque requête.
let _reqToken = null;
function setRequestToken(token) { _reqToken = token || null; }

// Cache credentials for 60 seconds (DB-first, env fallback)
let _credCache = null;
let _credTime = 0;

async function getYangoCreds() {
  const now = Date.now();
  if (_credCache && (now - _credTime) < 60000) return _credCache;

  // 1) Try reading from fleet_settings in Supabase (DB-first)
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/fleet_settings?select=integrations&order=created_at.desc`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${_reqToken || SUPABASE_ANON_KEY}`,
        },
      }
    );
    const rows = await res.json();
    for (const row of (Array.isArray(rows) ? rows : [])) {
      const y = row?.integrations?.yango;
      if (y && y.parkId && y.apiKey) {
        _credCache = { parkId: y.parkId, apiKey: y.apiKey, clientId: y.clientId || '' };
        _credTime = now;
        console.log('[Yango] Credentials loaded from Supabase fleet_settings');
        return _credCache;
      }
    }
  } catch (e) {
    console.warn('[Yango] fleet_settings fetch error:', e.message);
  }

  // 2) Fallback to env vars
  const creds = {
    parkId: process.env.YANGO_PARK_ID || '',
    apiKey: process.env.YANGO_API_KEY || '',
    clientId: process.env.YANGO_CLIENT_ID || '',
  };
  if (creds.parkId && creds.apiKey) {
    _credCache = creds;
    _credTime = now;
    console.log('[Yango] Credentials loaded from env vars');
  }
  return creds;
}

async function assertYangoCreds() {
  const creds = await getYangoCreds();
  if (!creds.parkId || !creds.apiKey || !creds.clientId) {
    throw new Error('Yango API credentials not configured');
  }
  return creds;
}

// =================== YANGO POST (with retries) ===================

async function yangoFetch(endpoint, body = {}, maxRetries = 3) {
  const { apiKey, clientId } = await assertYangoCreds();
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
  const { parkId, apiKey, clientId } = await assertYangoCreds();

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
  const { parkId } = await assertYangoCreds();
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

const CASH_CATS = ['cash_collected', 'partner_ride_cash_collected'];
const CARD_CATS = ['card', 'partner_ride_card', 'ewallet_payment', 'terminal_payment'];
const YANGO_CATS = ['platform_ride_fee', 'platform_ride_vat'];
const PARTNER_CAT = 'partner_ride_fee';

/**
 * Agrege les transactions PAR chauffeur en une seule passe.
 * Appeler aggregateTransactions une fois par chauffeur relirait tout le
 * tableau a chaque fois : inutilisable pour synchroniser une flotte entiere.
 * Retourne { <yangoDriverId>: { caBrut, commissionYango, caNet, nbCourses } }.
 */
function aggregateParChauffeur(transactions) {
  const parChauffeur = {};
  const commandes = {};
  for (const tx of transactions || []) {
    const id = tx.driver_profile_id;
    if (!id) continue;
    const cat = tx.category_id || '';
    const montant = parseFloat(tx.amount || 0);
    const a = parChauffeur[id] || (parChauffeur[id] = { caBrut: 0, commissionYango: 0, caNet: 0, nbCourses: 0 });

    if (CASH_CATS.includes(cat) || CARD_CATS.includes(cat)) {
      a.caBrut += montant;
      // Une course peut generer plusieurs lignes : on compte les commandes
      // distinctes quand l'identifiant est fourni, sinon les encaissements.
      const cmd = tx.order_id || tx.ride_id || null;
      if (cmd) {
        const cle = id + '|' + cmd;
        if (!commandes[cle]) { commandes[cle] = true; a.nbCourses += 1; }
      } else {
        a.nbCourses += 1;
      }
    } else if (YANGO_CATS.includes(cat)) {
      a.commissionYango += Math.abs(montant);
    }
  }
  for (const id of Object.keys(parChauffeur)) {
    const a = parChauffeur[id];
    a.caNet = a.caBrut - a.commissionYango;
  }
  return parChauffeur;
}

/** Ecriture (upsert) dans Supabase avec le jeton de l'appelant. */
async function supabaseUpsert(table, rows, token, conflictCols) {
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const q = conflictCols ? `?on_conflict=${encodeURIComponent(conflictCols)}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${q}`, {
    method: 'POST', headers, body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upsert ${res.status}: ${text.substring(0, 250)}`);
  }
  return true;
}

function aggregateTransactions(transactions, filterDriverId = null) {
  let cash = 0, card = 0, commissionYango = 0, commissionPartenaire = 0;

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
  isAdmin,
  getToken,
  setRequestToken,
  supabaseQuery,
  getYangoCreds,
  assertYangoCreds,
  yangoFetch,
  yangoGet,
  setCors,
  handleOptions,
  fetchAllTransactions,
  aggregateTransactions,
  aggregateParChauffeur,
  supabaseUpsert,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  YANGO_BASE,
};
