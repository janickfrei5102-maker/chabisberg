/**
 * Admin console routes — all protected by requireAdmin middleware.
 *
 * Security model:
 *   - router.use(requireAdmin) applied FIRST → every sub-route automatically
 *     requires admin role. No individual route can accidentally forget the check.
 *   - Destructive actions (delete, password reset) use POST forms, never GET,
 *     so browser link prefetch / curl accidents cannot trigger them.
 *   - CSRF tokens are validated globally in app.js before this router runs.
 *   - Deleting a user who is the last admin is blocked server-side to prevent
 *     accidental lockout.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { requireAdmin } = require('../middleware/requireAuth');
const { addresses, users, tokens, posts, attachments } = require('../db/repos');

const router = express.Router();

/**
 * Apply admin guard to every route in this file.
 * requireAdmin: redirects unauthenticated to /auth/login, returns 403 for
 * authenticated non-admins. See src/middleware/requireAuth.js for details.
 */
router.use(requireAdmin);

/**
 * Use fast bcrypt rounds in test mode so the test suite doesn't stall.
 * Production uses 12 rounds (~250ms per hash) which is intentionally slow
 * to make brute-force attacks computationally expensive.
 */
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const [allAddresses, allUsers, allTokensArr, postResult, storageStats] = await Promise.all([
      addresses.findAll(),
      users.findAll(),
      tokens.findAll(),
      posts.findAll({ limit: 1 }),
      attachments.getStorageStats(),
    ]);
    res.render('admin/index', {
      addressCount: allAddresses.length,
      userCount: allUsers.length,
      unusedTokenCount: allTokensArr.filter((t) => !t.used).length,
      postCount: postResult.total,
      storageStats,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Addresses ────────────────────────────────────────────────────────────────

router.get('/addresses', async (req, res, next) => {
  try {
    const all = await addresses.findAll();
    res.render('admin/addresses/index', { addresses: all, message: req.query.message || null });
  } catch (err) {
    next(err);
  }
});

router.get('/addresses/new', (_req, res) => {
  res.render('admin/addresses/form', { address: null, error: null });
});

router.post('/addresses', async (req, res, next) => {
  const { street, house_number, postal_code, city, display_name, lat, lng } = req.body;
  try {
    await addresses.create({
      street: street?.trim(),
      house_number: house_number?.trim(),
      postal_code: postal_code?.trim(),
      city: city?.trim(),
      display_name: display_name?.trim() || null,
      lat: lat !== '' && lat != null ? parseFloat(lat) : null,
      lng: lng !== '' && lng != null ? parseFloat(lng) : null,
    });
    res.redirect('/admin/addresses?message=Adresse+angelegt');
  } catch (err) {
    next(err);
  }
});

router.get('/addresses/:id/edit', async (req, res, next) => {
  try {
    const address = await addresses.findById(req.params.id);
    if (!address)
      return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
    res.render('admin/addresses/form', { address, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/addresses/:id', async (req, res, next) => {
  const { street, house_number, postal_code, city, display_name, lat, lng } = req.body;
  try {
    await addresses.update(req.params.id, {
      street: street?.trim(),
      house_number: house_number?.trim(),
      postal_code: postal_code?.trim(),
      city: city?.trim(),
      display_name: display_name?.trim() || null,
      lat: lat !== '' && lat != null ? parseFloat(lat) : null,
      lng: lng !== '' && lng != null ? parseFloat(lng) : null,
    });
    res.redirect('/admin/addresses?message=Adresse+gespeichert');
  } catch (err) {
    next(err);
  }
});

router.post('/addresses/:id/delete', async (req, res, next) => {
  try {
    await addresses.delete(req.params.id);
    res.redirect('/admin/addresses?message=Adresse+gel%C3%B6scht');
  } catch (err) {
    next(err);
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get('/users', async (req, res, next) => {
  try {
    const [allUsers, allAddresses] = await Promise.all([users.findAll(), addresses.findAll()]);
    const addressMap = {};
    allAddresses.forEach((a) => {
      addressMap[a.id] = a.display_name || `${a.street} ${a.house_number}`;
    });
    res.render('admin/users/index', {
      users: allUsers,
      addressMap,
      message: req.query.message || null,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/users/new', async (req, res, next) => {
  try {
    const allAddresses = await addresses.findAll();
    res.render('admin/users/form', { user: null, addresses: allAddresses, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/users', async (req, res, next) => {
  const { username, display_name, password, role, address_id } = req.body;
  const allAddresses = await addresses.findAll().catch(() => []);

  if (!username?.trim() || !display_name?.trim() || !password || password.length < 8) {
    return res.status(400).render('admin/users/form', {
      user: null,
      addresses: allAddresses,
      error: 'Username, Anzeigename und Passwort (min. 8 Zeichen) erforderlich',
    });
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await users.create({
      username: username.trim(),
      display_name: display_name.trim(),
      password_hash: hash,
      role: role === 'admin' ? 'admin' : 'resident',
      address_id: address_id ? parseInt(address_id, 10) : null,
    });
    res.redirect('/admin/users?message=Benutzer+angelegt');
  } catch (err) {
    if (err.message?.includes('UNIQUE') || err.code === 'SQLITE_CONSTRAINT') {
      return res.status(400).render('admin/users/form', {
        user: null,
        addresses: allAddresses,
        error: 'Username bereits vergeben',
      });
    }
    next(err);
  }
});

router.get('/users/:id/edit', async (req, res, next) => {
  try {
    const [user, allAddresses] = await Promise.all([
      users.findById(req.params.id),
      addresses.findAll(),
    ]);
    if (!user) return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
    res.render('admin/users/form', {
      user,
      addresses: allAddresses,
      error: req.query.error || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id', async (req, res, next) => {
  const { username, display_name, password, role, address_id } = req.body;
  try {
    const updates = {
      username: username?.trim(),
      display_name: display_name?.trim() || undefined,
      role: role === 'admin' ? 'admin' : 'resident',
      address_id: address_id ? parseInt(address_id, 10) : null,
    };
    // Password reset: only update hash when a new password is supplied.
    // Leaving the field empty keeps the existing password unchanged.
    if (password) {
      if (password.length < 8) {
        return res.redirect(
          `/admin/users/${req.params.id}/edit?error=Passwort+muss+mindestens+8+Zeichen+haben`
        );
      }
      updates.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    }
    await users.update(req.params.id, updates);
    res.redirect('/admin/users?message=Benutzer+gespeichert');
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/delete', async (req, res, next) => {
  try {
    /**
     * Last-admin lockout prevention: if the target user is an admin and is
     * the only admin left, refuse the deletion. This is enforced server-side
     * because any frontend guard can be bypassed with a direct POST.
     */
    const targetUser = await users.findById(req.params.id);
    if (targetUser?.role === 'admin') {
      const allUsers = await users.findAll();
      const adminCount = allUsers.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        return res.redirect('/admin/users?message=Letzten+Admin+kann+nicht+gel%C3%B6scht+werden');
      }
    }
    await users.delete(req.params.id);
    res.redirect('/admin/users?message=Benutzer+gel%C3%B6scht');
  } catch (err) {
    next(err);
  }
});

// ─── Tokens ───────────────────────────────────────────────────────────────────

router.get('/tokens', async (req, res, next) => {
  try {
    const all = await tokens.findAll();
    res.render('admin/tokens/index', { tokens: all, message: req.query.message || null });
  } catch (err) {
    next(err);
  }
});

router.post('/tokens', async (req, res, next) => {
  try {
    await tokens.create();
    res.redirect('/admin/tokens?message=Token+generiert');
  } catch (err) {
    next(err);
  }
});

router.post('/tokens/:id/delete', async (req, res, next) => {
  try {
    await tokens.delete(req.params.id);
    res.redirect('/admin/tokens?message=Token+gel%C3%B6scht');
  } catch (err) {
    next(err);
  }
});

// ─── Posts ────────────────────────────────────────────────────────────────────

router.get('/posts', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const { rows, total } = await posts.findAll({ limit, offset: (page - 1) * limit });
    res.render('admin/posts/index', {
      posts: rows,
      total,
      page,
      pages: Math.ceil(total / limit),
      message: req.query.message || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/posts/:id/delete', async (req, res, next) => {
  try {
    // Delete attachment DB records first (FK constraint), then the post.
    // Physical files on disk are NOT deleted here — that belongs to a
    // periodic cleanup job that checks for orphaned files. Keeps this
    // request fast and avoids partial-delete race conditions.
    await attachments.deleteByPostId(req.params.id);
    await posts.delete(req.params.id);
    res.redirect('/admin/posts?message=Post+gel%C3%B6scht');
  } catch (err) {
    next(err);
  }
});

// ─── Uploads ──────────────────────────────────────────────────────────────────

router.get('/uploads', async (req, res, next) => {
  try {
    const stats = await attachments.getStorageStats();
    res.render('admin/uploads/index', { stats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
