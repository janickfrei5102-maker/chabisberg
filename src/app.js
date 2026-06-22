const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();

// Trust Cloudflare Tunnel reverse proxy — required for secure cookies behind HTTPS terminator
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', true);
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' needed for inline Leaflet map init scripts
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
        // OSM tile images fetched as <img> elements by Leaflet
        imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
        connectSrc: ["'self'"],
      },
    },
  })
);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Session store: SQLite in production/dev, MemoryStore in test
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
      // Secure cookies only when behind HTTPS proxy (Cloudflare Tunnel)
      secure: process.env.TRUST_PROXY === 'true',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Make session user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/', require('./routes/index'));

app.use((_req, res) => {
  res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
});

// Express error handler signature requires 4 params — _next intentionally unused
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).render('error', {
    message: process.env.NODE_ENV === 'production' ? 'Interner Serverfehler' : err.message,
    status: err.status || 500,
  });
});

module.exports = app;
