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
 * In production (behind HTTPS/Cloudflare Tunnel), we use the `__Host-` prefix.
 * This prefix enforces that:
 *   - The cookie may only be set over HTTPS (Secure flag required)
 *   - The Path must be "/"
 *   - No Domain attribute — prevents subdomain-theft attacks
 * In development, `__Host-` is not valid over HTTP, so we use a plain name.
 *
 * Test environment:
 * ─────────────────
 * CSRF validation is skipped when NODE_ENV === 'test'. This allows supertest
 * integration tests to POST without obtaining CSRF tokens. CSRF behavior itself
 * should be verified in dedicated CSRF tests that opt back into validation.
 */

const { doubleCsrf } = require('csrf-csrf');

/**
 * True when the app is running behind an HTTPS-terminating proxy (Cloudflare
 * Tunnel). Controls the Secure cookie flag and the cookie name prefix.
 */
const IS_HTTPS = process.env.TRUST_PROXY === 'true';

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  /**
   * The secret used to HMAC-sign the CSRF cookie value.
   * We reuse SESSION_SECRET to avoid a second secret to manage.
   * This is safe because the two use different algorithms and contexts.
   */
  getSecret: () => process.env.SESSION_SECRET || 'dev-csrf-secret-change-me',

  /**
   * Cookie name. `__Host-` prefix enforces Secure+Path=/+no Domain in HTTPS.
   * The `-dev` suffix in dev makes it visually distinct in browser devtools.
   */
  cookieName: IS_HTTPS ? '__Host-csrf' : 'csrf-dev',

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
     * Secure=true when behind HTTPS proxy. The Cloudflare Tunnel terminates TLS
     * and forwards HTTP internally; `trust proxy` is set to tell Express that
     * the request was originally HTTPS. Without Secure, the cookie would be sent
     * over plain HTTP inside the cluster, which is acceptable here (it's loopback),
     * but we set it correctly anyway.
     */
    secure: IS_HTTPS,

    path: '/',
  },

  /** 64 bytes of entropy. Overkill, but tokens are short-lived anyway. */
  size: 64,

  /**
   * Where to read the CSRF token from incoming POST/PUT/DELETE requests.
   * Forms submit it as `_csrf` in the URL-encoded body.
   * AJAX callers can also send it as the `x-csrf-token` header.
   */
  getTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token'],
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
