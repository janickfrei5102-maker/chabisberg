const express = require('express');
const { requireAdmin } = require('../middleware/requireAuth');
const router = express.Router();

// Admin routes — implemented in admin step
router.get('/', requireAdmin, (_req, res) => {
  res.render('admin/index');
});

module.exports = router;
