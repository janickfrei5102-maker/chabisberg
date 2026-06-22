/**
 * Authorization Middleware — Server-Side Enforcement
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SECURITY CONTRACT: Every write route (POST/PUT/PATCH/DELETE) that      ║
 * ║  touches user-addressable data MUST use one of these middleware         ║
 * ║  functions. Frontend checks are purely UX — they MUST NOT be relied on  ║
 * ║  for authorization. An attacker with cURL can bypass any UI.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Role model:
 * ───────────
 * admin   — unrestricted access to all data.
 * resident — read-only access to shared data (map, news stream).
 *            write access ONLY to their own address and its residents.
 *            may link additional users to their own address (e.g., spouse).
 *
 * How address ownership is enforced:
 * ────────────────────────────────────
 * `requireOwnsAddress(getAddressId)` accepts a function that extracts the
 * target address_id from the current request. This design makes the
 * authorization intent explicit in the route definition — you can see exactly
 * what is being checked without reading the middleware internals.
 *
 * Example usages in routes:
 *
 *   // Address_id comes directly from URL param
 *   router.delete('/addresses/:id', requireAuth, requireOwnsAddress(req => req.params.id), handler);
 *
 *   // Address_id must be resolved by looking up a related record
 *   router.put('/residents/:id', requireAuth, requireOwnsAddress(async req => {
 *     const r = await repos.residents.findById(req.params.id);
 *     return r?.address_id;   // undefined → 404 in middleware
 *   }), handler);
 *
 *   // Address_id comes from POST body
 *   router.post('/residents', requireAuth, requireOwnsAddress(req => req.body.address_id), handler);
 *
 * Why we use a factory function rather than reading address_id in a fixed way:
 * ─────────────────────────────────────────────────────────────────────────────
 * Different routes surface the target address differently: sometimes it's a URL
 * param, sometimes a body field, sometimes requires a DB lookup through a related
 * entity (e.g., resident.address_id). A factory makes each route's authorization
 * logic self-documenting without coupling the middleware to a specific route shape.
 */

/**
 * Require authenticated session. Redirects to /auth/login if not authenticated.
 * Use this as the first guard on any protected route.
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    // Preserve the original URL so we can redirect back after login
    return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  next();
}

/**
 * Require admin role. Returns 403 for authenticated non-admins.
 * Always call requireAuth before this — if the user is unauthenticated,
 * requireAdmin still redirects to login (belt-and-suspenders).
 */
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }

  if (req.session.user.role !== 'admin') {
    /**
     * Return 403, not 404.
     * Returning 404 when a resource exists is sometimes used to avoid revealing
     * the existence of admin endpoints, but for this app the admin URL (/admin)
     * is not a secret, so 403 is clearer for developers and operators.
     */
    return res.status(403).render('error', { message: 'Zugriff verweigert', status: 403 });
  }
  next();
}

/**
 * Require that the authenticated resident owns the address being modified.
 * Admin bypasses this check entirely.
 *
 * @param {Function} getAddressId - A sync or async function (req) => address_id.
 *   Must return the address_id of the resource being operated on.
 *   Return undefined/null to trigger a 404 (resource not found).
 *
 * Authorization matrix:
 *   unauthenticated → redirect to login
 *   admin           → next() (unrestricted)
 *   resident, no address_id in session → 403 (must register with an address)
 *   resident, address matches target   → next()
 *   resident, address DOES NOT match   → 403 + audit log
 */
function requireOwnsAddress(getAddressId) {
  return async (req, res, next) => {
    /**
     * Step 1: Authentication check.
     * The session user must exist. In practice requireAuth is always called first,
     * but we defend here too so requireOwnsAddress can be used standalone.
     */
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }

    /**
     * Step 2: Admin bypass.
     * Admins may modify any address's data without restriction.
     * This check must come BEFORE the address_id lookup to avoid
     * unnecessary DB queries for admin operations.
     */
    if (req.session.user.role === 'admin') {
      return next();
    }

    /**
     * Step 3: Resident must have an address assigned.
     * A resident without address_id has not completed registration properly.
     * This should not normally happen, but we must handle it defensively.
     */
    if (!req.session.user.address_id) {
      return res.status(403).render('error', {
        message: 'Kein Adresse zugewiesen. Bitte Registrierung abschliessen.',
        status: 403,
      });
    }

    /**
     * Step 4: Resolve the target address_id from the request.
     * The caller provides a function so this middleware stays decoupled from
     * the specific route shape (param, body, or DB lookup).
     */
    let targetAddressId;
    try {
      targetAddressId = await getAddressId(req);
    } catch (_err) {
      return res.status(500).render('error', { message: 'Interner Fehler', status: 500 });
    }

    if (targetAddressId === undefined || targetAddressId === null) {
      return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
    }

    /**
     * Step 5: Core ownership check.
     * Convert both sides to Number for comparison — request params arrive as
     * strings, session stores numbers, so a strict === would always fail.
     *
     * This is the single authoritative enforcement point for the rule:
     *   "Resident darf NUR Daten seiner eigenen address_id schreiben."
     */
    if (Number(targetAddressId) !== Number(req.session.user.address_id)) {
      /**
       * Log the attempt. This is intentional security auditing — do not remove.
       * In production these logs go to wherever stdout goes (Docker logs, syslog).
       * Consider forwarding to a SIEM if the platform grows.
       */
      console.warn(
        `[AUTH] VIOLATION: user ${req.session.user.id} (address_id=${req.session.user.address_id}) ` +
          `attempted to write to address_id=${targetAddressId} — blocked`
      );

      return res.status(403).render('error', { message: 'Zugriff verweigert', status: 403 });
    }

    next();
  };
}

/**
 * Require that the authenticated user can link a new user to a given address.
 *
 * Rules:
 *   admin    → may link any user to any address.
 *   resident → may only link new users to their OWN address.
 *              (Use case: a resident invites their spouse to create an account
 *              linked to the same address, without giving admin rights.)
 *
 * The target address_id is read from `req.body.address_id` or
 * `req.params.address_id`. Routes must ensure one of these is present.
 */
function requireCanLinkUser(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }

  if (req.session.user.role === 'admin') {
    return next();
  }

  const targetAddressId = Number(req.body?.address_id ?? req.params?.address_id);

  if (!targetAddressId || isNaN(targetAddressId)) {
    return res.status(400).render('error', { message: 'Ungültige Adresse', status: 400 });
  }

  /**
   * Resident may only link users to their own address.
   * They cannot grant access to a neighbour's address.
   */
  if (targetAddressId !== Number(req.session.user.address_id)) {
    console.warn(
      `[AUTH] VIOLATION: user ${req.session.user.id} (address_id=${req.session.user.address_id}) ` +
        `attempted to link a user to address_id=${targetAddressId} — blocked`
    );
    return res.status(403).render('error', { message: 'Zugriff verweigert', status: 403 });
  }

  next();
}

/**
 * API variant of requireAuth: returns 401 JSON instead of redirecting.
 * Used on JSON API endpoints where an HTML redirect makes no sense.
 * The Fetch API (and other JSON clients) cannot follow HTML redirects.
 */
function requireAuthJson(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Nicht eingeloggt' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireOwnsAddress,
  requireCanLinkUser,
  requireAuthJson,
};
