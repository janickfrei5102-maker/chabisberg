/**
 * JSON API routes — consumed by the Leaflet map frontend.
 *
 * Security: all endpoints require an active session (requireAuthJson returns
 * 401 JSON instead of redirecting, which is correct for fetch() callers).
 * Neighbour contact data is sensitive — never expose without authentication.
 */

const express = require('express');
const { requireAuthJson } = require('../middleware/requireAuth');
const { addresses } = require('../db/repos');

const router = express.Router();

/**
 * GET /api/addresses
 *
 * Returns all addresses that have coordinates, with their residents nested.
 * Used by the map to place markers and render popups.
 *
 * Response shape:
 * [
 *   {
 *     id, street, house_number, postal_code, city, display_name, lat, lng,
 *     residents: [{ id, display_name, claim, picture, type }, ...]
 *   }, ...
 * ]
 */
router.get('/addresses', requireAuthJson, async (_req, res, next) => {
  try {
    const data = await addresses.findAllForMap();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
