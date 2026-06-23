/**
 * Authentication Routes
 *
 * Security properties maintained by this module:
 * ─────────────────────────────────────────────────
 *
 * 1. Constant-time login (timing attack resistance)
 *    bcrypt.compare is always called, even when the username does not exist.
 *    Without this, an attacker could enumerate valid usernames by measuring
 *    response time: "username not found" would be fast (no bcrypt), while
 *    "wrong password" would be slow (bcrypt). We use DUMMY_HASH to ensure
 *    equal response time in both cases.
 *
 * 2. Session fixation prevention
 *    After successful login, req.session.regenerate() creates a NEW session ID.
 *    Without this, an attacker who obtained the pre-login session ID (e.g., via
 *    network sniffing before HTTPS, or via another vulnerability) could set that
 *    ID in a victim's browser, wait for the victim to log in, and then reuse
 *    the now-authenticated session. Regeneration invalidates the old ID.
 *
 * 3. Generic error messages
 *    Login failures always return "Ungültige Anmeldedaten" regardless of whether
 *    the username or the password was wrong. This prevents username enumeration:
 *    an attacker could otherwise determine valid usernames by seeing different
 *    error messages.
 *
 * 4. Rate limiting on login
 *    IP-based rate limit: 10 failed attempts per 15 minutes. Successful attempts
 *    don't count against the limit. This slows credential stuffing attacks while
 *    not blocking legitimate users who mistype their password a few times.
 *    Note: IP spoofing behind Cloudflare Tunnel requires `trust proxy` (set in
 *    app.js) so the real client IP is used, not the tunnel's egress IP.
 *
 * 5. CSRF protection
 *    Applied globally in app.js via csrfProtection. All POST routes here are
 *    automatically protected. In test mode, CSRF is disabled for simplicity.
 *
 * 6. Token registration security
 *    Registration tokens are single-use and short (~6 chars). Brute-forcing a
 *    6-char hex token from a pool of unguessed tokens would require many requests,
 *    blocked by rate limiting on the register endpoint. After use, the token is
 *    marked used with the user_id for audit purposes — it is never deleted.
 *
 * 7. Password requirements
 *    Minimum 8 characters. bcrypt automatically truncates at 72 bytes — for this
 *    app that is acceptable. If Unicode passwords are expected, consider bcrypt-
 *    pepper or Argon2.
 */

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const repos = require('../db/repos');

const router = express.Router();

/**
 * bcrypt cost factor.
 * 12 rounds ≈ 400ms per hash on modern hardware — slow enough to resist brute
 * force, fast enough for normal login. Tests use 4 rounds (~3ms) to stay fast.
 */
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

/**
 * DUMMY_HASH — used for constant-time login when username is not found.
 * Generated synchronously at startup with the same cost as real passwords.
 * compare() against this always returns false, but takes the same wall-clock
 * time as a real bcrypt comparison, preventing username enumeration via timing.
 *
 * We use bcrypt.hashSync here because it runs once at startup and ensures
 * DUMMY_HASH is available before the first request arrives.
 */
const DUMMY_HASH = bcrypt.hashSync('__chabisberg_timing_dummy__', BCRYPT_ROUNDS);

/**
 * Rate limiter applied to POST /login.
 *
 * 10 attempts per 15 minutes per IP before blocking.
 * skipSuccessfulRequests: successful logins don't count — only failures.
 * skip in test mode so tests don't get rate-limited during repeated runs.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res) => {
    res.status(429).render('error', {
      message: 'Zu viele Anmeldeversuche. Bitte 15 Minuten warten.',
      status: 429,
    });
  },
});

// ────────────────────────────────────────────────────────────────────────────
// GET /auth/login
// ────────────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { error: null, redirect: req.query.redirect || '/' });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ────────────────────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, rememberMe, redirect } = req.body;
  const redirectTo = redirect && redirect.startsWith('/') ? redirect : '/';

  /**
   * Input validation — reject obviously missing fields before hitting the DB.
   * We do NOT reveal which field is missing (generic error) to avoid leaking
   * whether a given username exists.
   */
  if (!username || !password) {
    return res.status(400).render('auth/login', {
      error: 'Benutzername und Passwort erforderlich.',
      redirect: redirectTo,
    });
  }

  /**
   * Look up user by username. We do not yet fail if the user is not found —
   * we must run bcrypt.compare first to maintain constant response time.
   */
  const user = await repos.users.findByUsername(username.trim());

  /**
   * Always run bcrypt.compare, even if the user doesn't exist.
   * If user is null, we compare against DUMMY_HASH (which always returns false).
   * This ensures the response time is the same whether the username was wrong
   * or the password was wrong — preventing timing-based username enumeration.
   */
  const compareHash = user ? user.password_hash : DUMMY_HASH;
  const passwordValid = await bcrypt.compare(password, compareHash);

  if (!user || !passwordValid) {
    /**
     * Generic message: never reveal which of (username, password) was wrong.
     * An attacker should not be able to determine whether a username is registered.
     */
    return res.status(401).render('auth/login', {
      error: 'Ungültige Anmeldedaten.',
      redirect: redirectTo,
    });
  }

  /**
   * Session fixation prevention: regenerate the session ID after successful
   * authentication. This invalidates any session ID that may have been set
   * before login (e.g., one planted by an attacker). The session DATA is
   * preserved by the callback — only the ID changes.
   */
  await new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  /**
   * Store the minimal user data needed for authorization in the session.
   * NEVER store the password_hash or other sensitive fields in the session.
   * The session is serialized to the session store (SQLite) and could be
   * inspected by an operator with DB access.
   */
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    address_id: user.address_id,
  };

  /**
   * "Eingeloggt bleiben" — extends the session cookie lifetime to 30 days.
   * Without this, the session is a "browser session cookie" that expires when
   * the browser is closed. express-session's `saveUninitialized: false` ensures
   * we only persist sessions that have data.
   */
  if (rememberMe) {
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  /**
   * Explicit save required after session.regenerate().
   * express-session auto-saves on res.end(), but after regenerate() the new
   * session object is not always detected as modified by the auto-save hook —
   * resulting in no Set-Cookie header being sent. Calling save() explicitly
   * guarantees the session is persisted and the cookie is set before redirect.
   */
  await new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });

  return res.redirect(redirectTo);
});

// ────────────────────────────────────────────────────────────────────────────
// GET /auth/register
// ────────────────────────────────────────────────────────────────────────────
router.get('/register', async (req, res) => {
  if (req.session.user) return res.redirect('/');
  const addresses = await repos.addresses.findAll();
  res.render('auth/register', { error: null, addresses, values: {} });
});

// ────────────────────────────────────────────────────────────────────────────
// POST /auth/register
// ────────────────────────────────────────────────────────────────────────────
router.post(
  '/register',
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req, res) =>
      res.status(429).render('error', { message: 'Zu viele Registrierungsversuche.', status: 429 }),
  }),
  async (req, res) => {
    const { token, username, password, passwordConfirm, address_id } = req.body;
    const values = { token, username, address_id }; // repopulate form on error

    const renderError = async (msg) => {
      const addresses = await repos.addresses.findAll();
      return res.status(400).render('auth/register', { error: msg, addresses, values });
    };

    // ── Field presence checks ─────────────────────────────────────────────
    if (!token || !username || !password || !passwordConfirm || !address_id) {
      return renderError('Alle Felder sind erforderlich.');
    }

    // ── Password match ────────────────────────────────────────────────────
    if (password !== passwordConfirm) {
      return renderError('Passwörter stimmen nicht überein.');
    }

    // ── Minimum password length ───────────────────────────────────────────
    if (password.length < 8) {
      return renderError('Passwort muss mindestens 8 Zeichen haben.');
    }

    /**
     * ── Token validation ──────────────────────────────────────────────────
     * Tokens are single-use. We look up the token and check:
     *   1. It exists.
     *   2. It has not already been used.
     * We do NOT delete tokens after use — they are marked used + audited.
     * This allows admins to see which token was used by which user.
     */
    const tokenRecord = await repos.tokens.findByToken(token.trim().toUpperCase());
    if (!tokenRecord || tokenRecord.used) {
      return renderError('Ungültiger oder bereits verwendeter Token.');
    }

    // ── Address existence check ───────────────────────────────────────────
    const address = await repos.addresses.findById(Number(address_id));
    if (!address) {
      return renderError('Ungültige Adresse.');
    }

    // ── Username uniqueness ───────────────────────────────────────────────
    const existing = await repos.users.findByUsername(username.trim());
    if (existing) {
      /**
       * We reveal that the username is taken because the user needs to choose
       * a different one. This is unlike login, where revealing "username not found"
       * would aid enumeration. Here the user is providing a NEW username that
       * THEY are choosing, so confirming it's taken is necessary and safe.
       */
      return renderError('Benutzername bereits vergeben.');
    }

    /**
     * ── Create user ───────────────────────────────────────────────────────
     * Hash the password before inserting. Never store plaintext.
     * BCRYPT_ROUNDS is defined at module top (12 in prod, 4 in test).
     */
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = await repos.users.create({
      username: username.trim(),
      password_hash: passwordHash,
      address_id: Number(address_id),
      role: 'resident',
    });

    /**
     * ── Mark token used ───────────────────────────────────────────────────
     * Record which user consumed this token. This provides an audit trail
     * and prevents the token from being used again.
     */
    await repos.tokens.markUsed(tokenRecord.id, newUser.id);

    /**
     * ── Auto-login after registration ─────────────────────────────────────
     * Regenerate session ID (same fixation-prevention logic as in POST /login).
     */
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.user = {
      id: newUser.id,
      username: newUser.username,
      role: newUser.role,
      address_id: newUser.address_id,
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    return res.redirect('/');
  }
);

// ────────────────────────────────────────────────────────────────────────────
// POST /auth/logout
// ────────────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  /**
   * Destroy the entire session (removes from session store, clears cookie).
   * We do not just clear req.session.user — destroying the session ensures
   * the session ID is invalidated on the server side, preventing session
   * replay attacks with a stolen cookie.
   */
  req.session.destroy((err) => {
    if (err) console.error('[AUTH] Session destroy failed:', err);
    // Clear the session cookie on the client side too
    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
});

module.exports = router;
