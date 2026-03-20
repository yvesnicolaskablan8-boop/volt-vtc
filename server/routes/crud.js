const express = require('express');
const authMiddleware = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLogger');
const { broadcast } = require('../utils/sse');

// Model name to Mongoose model mapping
const models = {};

function getModel(modelName) {
  if (!models[modelName]) {
    models[modelName] = require(`../models/${modelName}`);
  }
  return models[modelName];
}

/**
 * Creates standard CRUD routes for a Mongoose model.
 * Returns an Express router with GET, POST, PUT, DELETE endpoints.
 * All queries are automatically scoped by entrepriseId from JWT.
 */
function createCrudRoutes(modelName) {
  const router = express.Router();
  router.use(authMiddleware);

  // Extraire le nom de collection depuis l'URL (ex: /api/versements → versements)
  const getCollectionName = (req) => req.baseUrl.replace('/api/', '');

  // PUT / - Bulk replace all documents (used for budgets)
  router.put('/', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const items = req.body;
      const entrepriseId = req.user.entrepriseId;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Expected an array' });
      }
      // Delete only this tenant's documents
      await Model.deleteMany(entrepriseId ? { entrepriseId } : {});
      // Insert all new documents with entrepriseId
      if (items.length > 0) {
        const scoped = entrepriseId ? items.map(i => ({ ...i, entrepriseId })) : items;
        await Model.insertMany(scoped);
      }
      logActivity('bulk_replace', modelName, null, { count: items.length }, req);
      broadcast(entrepriseId, getCollectionName(req), 'bulk_replace', items, req.headers['x-client-id']);
      res.json({ success: true, count: items.length });
    } catch (err) {
      next(err);
    }
  });

  // GET / - List documents with optional pagination
  // Query params: ?limit=N&skip=N&sort=field&order=asc|desc&from=ISO&to=ISO
  router.get('/', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const { limit, skip, sort, order, from, to } = req.query;
      const entrepriseId = req.user.entrepriseId;

      // Build query filter for date ranges
      let filter = {};
      if (entrepriseId) filter.entrepriseId = entrepriseId;

      if (from || to) {
        const dateFilter = {};
        if (from) dateFilter.$gte = from;
        if (to) dateFilter.$lte = to;
        filter.$or = [{ date: dateFilter }, { dateHeure: dateFilter }];
      }

      let query = Model.find(filter).lean();

      // Apply sorting
      if (sort) {
        const sortOrder = order === 'asc' ? 1 : -1;
        query = query.sort({ [sort]: sortOrder });
      }

      // Apply pagination
      if (skip) query = query.skip(parseInt(skip));
      if (limit) query = query.limit(parseInt(limit));

      const docs = await query;
      // Clean MongoDB fields for frontend compatibility
      const cleaned = docs.map(doc => {
        const { _id, __v, ...rest } = doc;
        return rest;
      });
      res.json(cleaned);
    } catch (err) {
      next(err);
    }
  });

  // GET /:id - Get single document by custom id
  router.get('/:id', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const entrepriseId = req.user.entrepriseId;
      const filter = { id: req.params.id };
      if (entrepriseId) filter.entrepriseId = entrepriseId;

      const doc = await Model.findOne(filter).lean();
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      const { _id, __v, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      next(err);
    }
  });

  // POST / - Create new document
  router.post('/', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const entrepriseId = req.user.entrepriseId;
      const data = entrepriseId ? { ...req.body, entrepriseId } : req.body;
      const doc = new Model(data);
      await doc.save();
      logActivity('create', modelName, doc.id || req.body.id, { fields: Object.keys(req.body) }, req);
      const { _id, __v, ...cleanDoc } = doc.toJSON();
      broadcast(entrepriseId, getCollectionName(req), 'add', cleanDoc, req.headers['x-client-id']);
      res.status(201).json(doc.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // PUT /:id - Update document by custom id
  router.put('/:id', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const entrepriseId = req.user.entrepriseId;
      const filter = { id: req.params.id };
      if (entrepriseId) filter.entrepriseId = entrepriseId;

      const doc = await Model.findOneAndUpdate(
        filter,
        { $set: req.body },
        { new: true, runValidators: true }
      );
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      logActivity('update', modelName, req.params.id, { fields: Object.keys(req.body) }, req);
      const { _id: _id2, __v: __v2, ...cleanUpdated } = doc.toJSON();
      broadcast(entrepriseId, getCollectionName(req), 'update', cleanUpdated, req.headers['x-client-id']);
      res.json(doc.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id - Delete document by custom id
  router.delete('/:id', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const entrepriseId = req.user.entrepriseId;
      const filter = { id: req.params.id };
      if (entrepriseId) filter.entrepriseId = entrepriseId;

      const doc = await Model.findOneAndDelete(filter);
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      logActivity('delete', modelName, req.params.id, {}, req);
      broadcast(entrepriseId, getCollectionName(req), 'delete', { id: req.params.id }, req.headers['x-client-id']);
      res.json({ success: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createCrudRoutes;
