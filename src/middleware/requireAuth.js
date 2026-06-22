/**
 * Authorization middleware — server-side enforcement.
 * All route protection flows through these functions.
 * Never rely on frontend-only checks.
 */

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', { message: 'Kein Zugriff', status: 403 });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
