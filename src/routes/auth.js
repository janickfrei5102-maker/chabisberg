const express = require('express');
const router = express.Router();

// Auth routes — login/logout/register implemented in auth step
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { error: null });
});

router.post('/login', (_req, res) => {
  res.render('auth/login', { error: 'Noch nicht implementiert' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

module.exports = router;
