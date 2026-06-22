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

## Docker: Multi-Stage Build

**Wahl:** `deps`-Stage (`npm ci --omit=dev`) + `runtime`-Stage (nur Production-Artefakte).
**Grund:** Dev-Dependencies (jest, eslint, prettier, nodemon, supertest) nicht im Produktions-Image. Kleineres Image, reduzierte Angriffsfläche.

## Docker: Nicht-Root-User

App läuft als `chabisberg`-User. Daten-Verzeichnisse `/data/*` gehören diesem User.
**Grund:** Principle of Least Privilege — falls Node-Prozess kompromittiert wird, kein Root-Zugriff auf den Host.

## Docker: Migrations + Seed beim Container-Start

`CMD` führt `knex migrate:latest && knex seed:run && node src/server.js` aus.
**Grund:** Beide Befehle sind idempotent. Kein manueller Schritt nach Update nötig.

## Cloudflare Tunnel statt Port-Forwarding

**Wahl:** `cloudflared` als Service in docker-compose, kein Inbound-Port am Router.
**Grund:** Kein offener Port im Heimnetz. Cloudflare terminiert TLS. Free-Plan ausreichend.
**Limit:** Cloudflare Free ~100 MB pro Request → `MAX_UPLOAD_SIZE_MB=90` als App-Cap mit Puffer.

## HOST_PORT: localhost-only Binding (Standard)

Standard `HOST_PORT=127.0.0.1:3000` — App nur lokal auf dem Unraid-Host erreichbar.
Cloudflare Tunnel erreicht Container über internes Docker-Netzwerk (`http://chabisberg:3000`).
**Grund:** Kein versehentlicher Direktzugriff am Tunnel vorbei.
