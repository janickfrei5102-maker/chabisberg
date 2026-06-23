const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { csrfProtection, attachCsrfToken } = require('./middleware/csrf');

const app = express();

// Trust Cloudflare Tunnel reverse proxy — required for secure cookies and
// correct client-IP extraction (used by rate limiter) behind HTTPS terminator
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
}

// Security headers.
// upgradeInsecureRequests and HSTS always disabled: Cloudflare Tunnel handles
// HTTPS at the edge. Sending these from the origin breaks direct HTTP access
// (Unraid LAN port 3000, local dev) because the browser upgrades all resource
// URLs to HTTPS which then fail. Cloudflare enforces HTTPS independently.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' needed for inline Leaflet map init scripts and inline event handlers
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        // Helmet 7 defaults to script-src-attr 'none' which blocks onclick= attributes.
        // We use inline handlers in EJS templates (gallery, lightbox, resident form, admin map).
        // 'unsafe-inline' here mirrors what we already allow in scriptSrc.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        // OSM tile images fetched as <img> elements by Leaflet
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    hsts: false,
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// cookie-parser required by csrf-csrf to read the CSRF double-submit cookie from req.cookies
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));
// Serve resident profile picture thumbnails. Auth check is on /api/addresses (map data).
// Individual thumbnail URLs are not guessable (UUID-based filenames), providing
// obscurity-based protection for profile pictures accessed via direct URL.
app.use('/thumbs', express.static(path.join(process.env.THUMBNAIL_DIR || './thumbnails')));
// Serve uploaded files (post attachments, resident original pictures).
// Files have UUID-based names — not guessable. URLs are only shown to
// authenticated users by the application templates.
app.use('/uploads', express.static(path.join(process.env.UPLOAD_DIR || './uploads')));

// Session store: SQLite in production/dev, MemoryStore (express-session built-in) in test
let sessionStore;
if (process.env.NODE_ENV !== 'test') {
  const SQLiteStore = require('connect-sqlite3')(session);
  sessionStore = new SQLiteStore({
    db: 'sessions.sqlite',
    dir: path.dirname(process.env.DATABASE_PATH || './dev.sqlite'),
  });
}

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Secure=false: works on both plain HTTP (direct LAN / Unraid port 3000)
      // and HTTPS (Cloudflare Tunnel). Cloudflare enforces HTTPS at the edge;
      // the origin-to-browser leg is always same-network HTTP. A Secure=true
      // cookie would be silently dropped by browsers on HTTP, breaking login.
      secure: false,
      sameSite: 'lax',
      // No default maxAge — session cookie (expires on browser close).
      // POST /auth/login sets maxAge=30 days when "Eingeloggt bleiben" is checked.
    },
  })
);

/**
 * Set safe defaults for res.locals so templates always have these variables,
 * even when an error fires before the dedicated middleware runs (e.g., a CSRF
 * rejection happens before attachCsrfToken and the user middleware execute).
 * Without these defaults, header.ejs throws ReferenceError on error pages.
 */
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.csrfToken = ''; // overwritten by attachCsrfToken on GET requests
  res.locals.currentPath = req.path; // used by nav to highlight active link
  next();
});

/**
 * CSRF protection: validates token on POST/PUT/DELETE/PATCH.
 * Must come AFTER session middleware (session can be used as token store).
 * Must come BEFORE routes that process forms.
 * In test mode this is a no-op (see src/middleware/csrf.js).
 */
app.use(csrfProtection);

/**
 * Generate CSRF token and make it available as res.locals.csrfToken.
 * EJS forms include: <input type="hidden" name="_csrf" value="<%= csrfToken %>">
 * Must come after csrfProtection so the token is generated with the same config.
 * Overwrites the empty-string default set above.
 */
app.use(attachCsrfToken);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
// Disable ETag for dynamic views — prevents 304 responses that serve a
// cached login page with a stale CSRF token, causing 403 on form submit.
app.set('etag', false);

app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/profile', require('./routes/profile'));
app.use('/posts', require('./routes/posts'));
app.use('/api', require('./routes/api'));
app.use('/', require('./routes/index'));

app.use((_req, res) => {
  res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
});

// Express error handler — 4-param signature required, _next intentionally unused
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  // Handle both err.status (Express convention) and err.statusCode (some libraries)
  const status = err.status || err.statusCode || 500;
  res.status(status).render('error', {
    message: process.env.NODE_ENV === 'production' ? 'Interner Serverfehler' : err.message,
    status,
  });
});

module.exports = app;
