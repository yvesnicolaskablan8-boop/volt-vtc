const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification pour les chauffeurs.
 * Verifie le JWT ET s'assure que role === 'chauffeur' et chauffeurId existe.
 */
const driverAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifie' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verifier que c'est bien un chauffeur
    if (decoded.role !== 'chauffeur') {
      return res.status(403).json({ error: 'Acces reserve aux chauffeurs' });
    }

    if (!decoded.chauffeurId) {
      return res.status(403).json({ error: 'Compte chauffeur non lie' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expiree' });
    }
    return res.status(401).json({ error: 'Token invalide' });
  }
};

module.exports = driverAuth;
