const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.render('index');
});

module.exports = router;
