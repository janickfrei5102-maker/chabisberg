# Chabisberg — Entscheidungen & Defaults

## Frontend: EJS (Server-Rendered)

**Wahl:** EJS statt SPA.
**Grund:** Kein Build-Schritt, kein Bundler, kein JS-Framework. Passt zu "einfach, robust, self-contained". Leaflet wird direkt via CDN (unpkg) geladen — kein npm-Bundle nötig. Bei komplexerem UI kann später leichtes Alpine.js ergänzt werden, ohne Architektur zu ändern.

## ORM: Knex (nicht Prisma)

**Grund:** Knex ist leichtgewichtiger, hat stabilen SQLite-Support via `better-sqlite3`, und der SQL-nahe Query-Builder passt besser zur einfachen Datenbankstruktur.

## SQLite-Treiber: better-sqlite3 (nicht sqlite3)

**Grund:** Synchrone API, kein Callback-Hell, bessere Performance. Knex unterstützt beide — `better-sqlite3` ist der empfohlene Treiber für neue Projekte.

## Session Store: connect-sqlite3

**Grund:** Kein Redis/Memcached nötig. Sessions im selben SQLite-Volume. In Tests: MemoryStore (express-session built-in) um Dateisystem-Nebeneffekte zu vermeiden.

## CSRF: csrf-csrf (nicht csurf)

**Grund:** `csurf` ist deprecated. `csrf-csrf` ist der moderne Nachfolger, aktiv maintained, gleiche API.

## Auth: Express-Session + HTTP-only Cookies

**Grund:** Vorgabe CLAUDE.md. `Secure`-Flag aktiv wenn `TRUST_PROXY=true` (hinter Cloudflare Tunnel).

## Upload-Limit: 90 MB (ENV-steuerbar)

**Grund:** Cloudflare Free-Plan Limit ~100 MB. 90 MB lässt Puffer für Request-Overhead.

## Migrations-Reihenfolge

`addresses → users → residents → tokens → posts → attachments`
Grund: FK-Abhängigkeiten. `users.address_id → addresses`, `tokens.used_by_user_id → users`, etc.

## Admin-Seeding

Seed ist idempotent (prüft ob Admin existiert). Credentials via ENV: `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Default: `admin` / `changeme` — muss in Produktion überschrieben werden.

## Test-Strategie (Scaffold)

Smoke-Tests mit Supertest gegen echten Express-App-Layer. Kein DB-Mocking — Autorisierungslogik wird in Schritt 2 gegen echte SQLite-Test-DB getestet.
