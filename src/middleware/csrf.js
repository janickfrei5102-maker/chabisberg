/**
 * CSRF Protection — Double Submit Cookie Pattern
 *
 * Overview of the attack this prevents:
 * ───────────────────────────────────────
 * Without CSRF protection, a malicious site (evil.com) could embed a form that
 * POSTs to chabisberg.example.com. The victim's browser automatically sends the
 * session cookie with the request, making the server think it's a legitimate
 * action from the authenticated user.
 *
 * How the double-submit cookie pattern works:
 * ─────────────────────────────────────────────
 * 1. Server generates a signed, random CSRF token and stores it in an HttpOnly
 *    cookie (the "cookie token").
 * 2. The same token value is embedded in every HTML form as a hidden field
 *    (<input type="hidden" name="_csrf" value="...">) — the "form token".
 * 3. On POST/PUT/DELETE, the server reads BOTH the cookie value and the form
 *    field value, verifies they match AND that the cookie was signed with the
 *    server's secret.
 *
 * Why this stops cross-site forgery:
 * ────────────────────────────────────
 * evil.com CAN trigger the victim's browser to send the session cookie (that's
 * the whole problem). But it CANNOT read the CSRF cookie value (Same-Origin
 * Policy blocks cross-origin cookie reads). Therefore, evil.com cannot know the
 * token to put in the form field. Without a matching, validly-signed form token,
 * the server rejects the request with 403.
 *
 * Why we use csrf-csrf instead of the deprecated csurf:
 * ────────────────────────────────────────────────────────
 * `csurf` was deprecated in 2023. `csrf-csrf` is the maintained successor,
 * implements the same double-submit pattern, and is compatible with Express 4.
 *
 * Cookie naming:
 * ──────────────
 * Plain name `csrf` — no __Host- prefix. Works over both HTTP and HTTPS.
 * The __Host- prefix would enforce Secure+HTTPS at the browser level, which
 * breaks direct LAN access on port 3000. CSRF protection is still effective
 * via HMAC-signed double-submit + SameSite=Lax.
 *
 * Test environment:
 * ─────────────────
 * CSRF validation is skipped when NODE_ENV === 'test'. This allows supertest
 * integration tests to POST without obtaining CSRF tokens. CSRF behavior itself
 * should be verified in dedicated CSRF tests that opt back into validation.
 */

const { doubleCsrf } = require('csrf-csrf');

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  /**
   * The secret used to HMAC-sign the CSRF cookie value.
   * We reuse SESSION_SECRET to avoid a second secret to manage.
   * This is safe because the two use different algorithms and contexts.
   */
  getSecret: () => process.env.SESSION_SECRET || 'dev-csrf-secret-change-me',

  /**
   * Plain cookie name without __Host- prefix so the cookie works over both
   * HTTP (direct access, local dev) and HTTPS (Cloudflare Tunnel).
   *
   * The __Host- prefix enforces Secure+HTTPS at the browser level — which
   * breaks direct HTTP access on port 3000. Since we also support HTTP access
   * (e.g. initial setup, local dev, Unraid LAN), we use a plain name.
   *
   * CSRF protection is still strong: the double-submit HMAC signature verifies
   * token integrity, and SameSite=Lax blocks cross-site form POSTs in all
   * modern browsers.
   */
  cookieName: 'csrf',

  cookieOptions: {
    /**
     * HttpOnly: JavaScript on the page cannot read this cookie.
     * The form token (from res.locals.csrfToken) is readable by the page — that
     * is intentional and required. The cookie itself is only read by the server.
     */
    httpOnly: true,

    /**
     * SameSite=Lax: Sent on same-site navigations (forms, links) but NOT on
     * cross-site requests (AJAX from evil.com, cross-site form POSTs that are
     * not top-level navigations). This is a defence-in-depth measure on top of
     * the double-submit check.
     */
    sameSite: 'lax',

    /**
     * secure: false — allow the cookie over HTTP for direct LAN access.
     * When behind Cloudflare Tunnel (HTTPS), the browser will send this cookie
     * regardless because SameSite=Lax covers the cross-site case.
     * The CSRF protection does not rely on the Secure flag for its correctness.
     */
    secure: false,

    path: '/',
  },

  /** 64 bytes of entropy. Overkill, but tokens are short-lived anyway. */
  size: 64,

  /**
   * Where to read the CSRF token from incoming POST/PUT/DELETE requests.
   *
   * Three sources checked in order:
   *   1. req.body._csrf       — standard URL-encoded and JSON forms
   *   2. x-csrf-token header  — AJAX/fetch callers
   *   3. req.query._csrf      — multipart/form-data forms (file uploads)
   *
   * Why req.query for multipart:
   *   csrfProtection runs as global middleware BEFORE route-level multer.
   *   For multipart/form-data, req.body is not populated until multer parses
   *   the request — so req.body._csrf is always undefined at CSRF check time.
   *   Passing the token as a query parameter on the form action URL
   *   (e.g., action="/profile/residents?_csrf=TOKEN") makes it available in
   *   req.query, which Express populates from the URL immediately.
   *
   *   Security: CSRF tokens do not need to be secret — they only need to match
   *   the signed CSRF cookie. Putting the token in the query string does not
   *   reduce security in the double-submit cookie scheme. The token value is
   *   meaningless without the matching signed cookie.
   */
  getTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token'] || req.query?._csrf,
});

/**
 * The protection middleware to apply on all routes.
 * In test mode, replaced by a no-op so integration tests don't need to
 * obtain and re-submit CSRF tokens on every POST.
 */
const csrfProtection =
  process.env.NODE_ENV === 'test' ? (_req, _res, next) => next() : doubleCsrfProtection;

/**
 * Middleware that generates a CSRF token and makes it available as
 * `res.locals.csrfToken` in every EJS template.
 *
 * Only called on GET/HEAD — POST/DELETE/PUT are protected by csrfProtection
 * and don't need to generate a new token (they consume one).
 *
 * EJS forms must include:
 *   <input type="hidden" name="_csrf" value="<%= csrfToken %>">
 */
function attachCsrfToken(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      res.locals.csrfToken = generateToken(req, res);
    } catch (_err) {
      // If token generation fails (misconfigured secret etc.), set empty string.
      // The subsequent POST will then correctly fail CSRF validation.
      res.locals.csrfToken = '';
    }
  } else {
    res.locals.csrfToken = '';
  }
  next();
}

module.exports = { generateToken, csrfProtection, attachCsrfToken };
