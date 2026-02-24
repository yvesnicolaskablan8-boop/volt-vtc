const express = require('express');
const authMiddleware = require('../middleware/auth');

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
 */
function createCrudRoutes(modelName) {
  const router = express.Router();
  router.use(authMiddleware);

  // PUT / - Bulk replace all documents (used for budgets)
  router.put('/', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const items = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Expected an array' });
      }
      // Delete all existing documents
      await Model.deleteMany({});
      // Insert all new documents
      if (items.length > 0) {
        await Model.insertMany(items);
      }
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

      // Build query filter for date ranges
      let filter = {};
      if (from || to) {
        // Try both 'date' and 'dateHeure' fields
        const dateFilter = {};
        if (from) dateFilter.$gte = from;
        if (to) dateFilter.$lte = to;
        // Determine which date field exists based on model
        filter = { $or: [{ date: dateFilter }, { dateHeure: dateFilter }] };
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
      const doc = await Model.findOne({ id: req.params.id }).lean();
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
      const doc = new Model(req.body);
      await doc.save();
      res.status(201).json(doc.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // PUT /:id - Update document by custom id
  router.put('/:id', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const doc = await Model.findOneAndUpdate(
        { id: req.params.id },
        { $set: req.body },
        { new: true, runValidators: true }
      );
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(doc.toJSON());
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:id - Delete document by custom id
  router.delete('/:id', async (req, res, next) => {
    try {
      const Model = getModel(modelName);
      const doc = await Model.findOneAndDelete({ id: req.params.id });
      if (!doc) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json({ success: true, id: req.params.id });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createCrudRoutes;
