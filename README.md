# Chabisberg

Quartier-Plattform: Interaktive Karte, Nachbarn-Profile, News-Stream.
Self-hosted auf Unraid, Zugang via Cloudflare Tunnel.

## Frontend-Wahl: EJS (Server-Rendered)

EJS statt SPA: kein Build-Schritt, kein Bundler, kein Framework-Overhead.
Leaflet direkt via CDN. Passt zu "einfach, robust, self-contained".
Details: [DECISIONS.md](./DECISIONS.md)

## Stack

- **Backend:** Node.js + Express
- **DB:** SQLite + Knex + better-sqlite3
- **Frontend:** EJS (Server-Rendered)
- **Karte:** Leaflet + OSM-Tiles (kein API-Key)
- **Auth:** express-session, HTTP-only Cookies, bcrypt
- **Uploads:** multer + sharp (Thumbnails)

## Lokal starten

```bash
cp .env.example .env
# .env anpassen (SESSION_SECRET, ADMIN_PASSWORD)
npm install
npm run seed    # Migrationen + Admin-User anlegen
npm run dev
```

App läuft auf http://localhost:3000

## NPM Scripts

| Script            | Beschreibung             |
| ----------------- | ------------------------ |
| `npm run dev`     | Dev-Server mit nodemon   |
| `npm start`       | Produktions-Start        |
| `npm test`        | Tests (Jest)             |
| `npm run lint`    | ESLint + Prettier        |
| `npm run seed`    | Migrationen + Seed-Daten |
| `npm run migrate` | Nur Migrationen          |

## Docker (Unraid)

```bash
docker compose up -d
```

### Volumes (Unraid Pfade)

| Container-Pfad     | Unraid-Pfad                               |
| ------------------ | ----------------------------------------- |
| `/data/db`         | `/mnt/user/appdata/chabisberg/db`         |
| `/data/uploads`    | `/mnt/user/appdata/chabisberg/uploads`    |
| `/data/thumbnails` | `/mnt/user/appdata/chabisberg/thumbnails` |

### ENV

Siehe `.env.example`. Wichtigste Variablen:

```
SESSION_SECRET=<langer-zufälliger-string>
ADMIN_PASSWORD=<sicheres-passwort>
DATABASE_PATH=/data/db/chabisberg.sqlite
TRUST_PROXY=true
```

## Cloudflare Tunnel

App läuft intern als `http://chabisberg:3000`.
Cloudflare Tunnel leitet HTTPS-Domain → internen Port.

**Wichtig:** Cloudflare Free-Plan Limit ~100 MB pro Request.
Upload-Limit im App ist 90 MB — liegt knapp darunter.

Konfiguration: Public Hostname → Service `http://chabisberg:3000`

`TRUST_PROXY=true` setzen, damit Secure-Cookies hinter HTTPS-Terminator korrekt gesetzt werden.
