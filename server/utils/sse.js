/**
 * SSE (Server-Sent Events) — Broadcast temps réel
 *
 * Permet de notifier tous les clients admin connectés quand une donnée change.
 * Chaque client est scopé par entrepriseId (multi-tenant).
 */
const jwt = require('jsonwebtoken');

// Map<entrepriseId, Set<{ res, clientId }>>
const clients = new Map();

/**
 * Connecte un client SSE.
 * Le token JWT est passé en query param (EventSource ne supporte pas les headers).
 */
function handleConnection(req, res) {
  // Auth via query param
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide' });
  }

  const entrepriseId = decoded.entrepriseId || '_default';
  const clientId = req.query.clientId || '';

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Nginx/Railway: pas de buffering
  });

  // Envoyer un commentaire initial pour confirmer la connexion
  res.write(': connected\n\n');

  // Enregistrer le client
  if (!clients.has(entrepriseId)) {
    clients.set(entrepriseId, new Set());
  }
  const client = { res, clientId };
  clients.get(entrepriseId).add(client);

  console.log(`[SSE] Client connecté (entreprise: ${entrepriseId}, clients: ${clients.get(entrepriseId).size})`);

  // Heartbeat toutes les 30s pour garder la connexion vivante
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Nettoyage à la déconnexion
  req.on('close', () => {
    clearInterval(heartbeat);
    const set = clients.get(entrepriseId);
    if (set) {
      set.delete(client);
      if (set.size === 0) clients.delete(entrepriseId);
    }
    console.log(`[SSE] Client déconnecté (entreprise: ${entrepriseId}, restants: ${clients.get(entrepriseId)?.size || 0})`);
  });
}

/**
 * Broadcast un événement à tous les clients d'un tenant.
 * @param {string} entrepriseId - tenant ID
 * @param {string} collection - nom de la collection (versements, chauffeurs, etc.)
 * @param {string} action - 'add' | 'update' | 'delete' | 'bulk_replace'
 * @param {object} data - les données (item complet pour add/update, { id } pour delete)
 * @param {string} [senderClientId] - ID du client émetteur (pour ne pas lui renvoyer)
 */
function broadcast(entrepriseId, collection, action, data, senderClientId) {
  const tenantId = entrepriseId || '_default';
  const set = clients.get(tenantId);
  if (!set || set.size === 0) return;

  const event = JSON.stringify({ collection, action, data });
  const message = `data: ${event}\n\n`;

  let sent = 0;
  for (const client of set) {
    // Ne pas renvoyer l'événement à l'émetteur
    if (senderClientId && client.clientId === senderClientId) continue;
    try {
      client.res.write(message);
      sent++;
    } catch (e) {
      // Client déconnecté — sera nettoyé au prochain close
      set.delete(client);
    }
  }

  if (sent > 0) {
    console.log(`[SSE] Broadcast ${collection}:${action} → ${sent} client(s) (entreprise: ${tenantId})`);
  }
}

/**
 * Nombre total de clients connectés (pour monitoring)
 */
function clientCount() {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

module.exports = { handleConnection, broadcast, clientCount };
