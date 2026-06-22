# Chabisberg

Quartier-Plattform: interaktive Karte, Nachbarn-Profile, News-Stream.
Self-hosted auf Unraid, Zugang via Cloudflare Tunnel.

## Stack

| Schicht | Technologie |
|---|---|
| Backend | Node.js + Express 4 |
| Datenbank | SQLite + Knex + better-sqlite3 |
| Frontend | EJS (server-rendered, kein Build-Schritt) |
| Karte | Leaflet + OSM-Tiles (kein API-Key) |
| Auth | express-session, HTTP-only Cookies, bcrypt |
| Uploads | multer + sharp (Thumbnails) |
| Deploy | Docker + Cloudflare Tunnel |

---

## Lokal starten (ohne Docker)

```bash
cp .env.example .env
# .env anpassen: SESSION_SECRET, ADMIN_PASSWORD, NODE_ENV=development, TRUST_PROXY=false
# Pfade auf lokale Verzeichnisse setzen (DATABASE_PATH=./dev.sqlite etc.)

npm install
npm run seed      # Migrationen ausführen + Admin-User anlegen
npm run dev       # Dev-Server mit auto-reload (nodemon)
```

App: http://localhost:3000  
Login: `admin` / Wert aus `ADMIN_PASSWORD` in `.env`

```bash
npm test          # Jest-Tests
npm run lint      # ESLint + Prettier
```

---

## Docker

### Image bauen & starten

```bash
cp .env.example .env
# Pflicht: SESSION_SECRET und ADMIN_PASSWORD setzen
# CLOUDFLARE_TUNNEL_TOKEN setzen (oder cloudflared-Service aus compose entfernen)

docker compose up -d
```

Migrationen + Seed laufen automatisch beim Container-Start.

### Volumes

Die App schreibt alle persistenten Daten in drei Verzeichnisse:

| Container-Pfad | Enthält | ENV-Variable (Host-Seite) |
|---|---|---|
| `/data/db` | SQLite-Datenbank | `DATA_DB_PATH` |
| `/data/uploads` | Original-Uploads (Posts, Profilbilder) | `DATA_UPLOADS_PATH` |
| `/data/thumbnails` | Sharp-Thumbnails | `DATA_THUMBNAILS_PATH` |

Standard (ohne Unraid): `./data/db`, `./data/uploads`, `./data/thumbnails` relativ zur `docker-compose.yml`.

---

## Unraid-Setup

### 1. Appdata-Verzeichnisse anlegen

In Unraid Terminal oder per File Manager:

```bash
mkdir -p /mnt/user/appdata/chabisberg/db
mkdir -p /mnt/user/appdata/chabisberg/uploads
mkdir -p /mnt/user/appdata/chabisberg/thumbnails
```

### 2. `.env` konfigurieren

```env
SESSION_SECRET=<langer-zufälliger-string>   # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
ADMIN_PASSWORD=<sicheres-passwort>
CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>

DATA_DB_PATH=/mnt/user/appdata/chabisberg/db
DATA_UPLOADS_PATH=/mnt/user/appdata/chabisberg/uploads
DATA_THUMBNAILS_PATH=/mnt/user/appdata/chabisberg/thumbnails

HOST_PORT=127.0.0.1:3000    # nur localhost — Cloudflare Tunnel übernimmt extern
TRUST_PROXY=true
```

### 3. Starten

```bash
docker compose up -d
```

Logs:

```bash
docker compose logs -f chabisberg
```

### 4. Update

```bash
docker compose pull        # neues Image holen (bei Verwendung von registry)
# oder bei lokalem Build:
docker compose build --no-cache
docker compose up -d
```

Migrationen laufen automatisch beim Start — keine manuellen Schritte nötig.

---

## Cloudflare Tunnel

### Ziel

Die App läuft intern als `http://chabisberg:3000` im Docker-Netzwerk.
`cloudflared` verbindet ausgehend zu Cloudflare — keine eingehenden Firewall-Ports nötig.

### Einrichtung (einmalig)

1. [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com) öffnen.
2. **Networks → Tunnels → Create a tunnel** (Typ: Cloudflared).
3. Tunnel benennen (z.B. `chabisberg`).
4. Token kopieren (wird in `.env` als `CLOUDFLARE_TUNNEL_TOKEN` eingetragen).
5. **Public Hostname** hinzufügen:
   - **Subdomain / Domain:** deine Domain (z.B. `quartier.example.com`)
   - **Service:** `http://chabisberg:3000`
6. Speichern.

### docker-compose.yml

`cloudflared` ist bereits als Service enthalten:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  command: tunnel --no-autoupdate run
  environment:
    TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
```

Der Container verbindet sich selbst zu Cloudflare. Kein `ports`-Mapping nötig.

### Upload-Limit

**Cloudflare Free-Plan: ~100 MB pro Request (hard limit).**  
Das App-Limit (`MAX_UPLOAD_SIZE_MB=90`) liegt bewusst darunter, um Puffer für Request-Overhead zu lassen. Grössere Dateien werden von der App abgelehnt bevor der Tunnel sie abschneidet.

---

## ENV-Referenz

| Variable | Default | Beschreibung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port des App-Servers |
| `NODE_ENV` | `production` | `development` aktiviert Morgan-Logging, deaktiviert CSRF im Test |
| `SESSION_SECRET` | — | **Pflicht.** Zufälliger String ≥ 32 Zeichen |
| `DATABASE_PATH` | `/data/db/chabisberg.sqlite` | Absoluter Pfad zur SQLite-Datei |
| `UPLOAD_DIR` | `/data/uploads` | Verzeichnis für Original-Uploads |
| `THUMBNAIL_DIR` | `/data/thumbnails` | Verzeichnis für Sharp-Thumbnails |
| `MAX_UPLOAD_SIZE_MB` | `90` | Max. Dateigrösse pro Anhang (MB) |
| `ADMIN_USERNAME` | `admin` | Benutzername des initialen Admin-Accounts (Seed) |
| `ADMIN_PASSWORD` | — | **Pflicht.** Passwort des initialen Admin-Accounts |
| `TRUST_PROXY` | `true` | `true` hinter Cloudflare Tunnel / Reverse Proxy |
| `DATA_DB_PATH` | `./data/db` | Host-Pfad für DB-Volume (docker-compose) |
| `DATA_UPLOADS_PATH` | `./data/uploads` | Host-Pfad für Uploads-Volume |
| `DATA_THUMBNAILS_PATH` | `./data/thumbnails` | Host-Pfad für Thumbnails-Volume |
| `HOST_PORT` | `127.0.0.1:3000` | Port-Binding auf Host (docker-compose) |
| `CLOUDFLARE_TUNNEL_TOKEN` | — | Tunnel-Token aus Cloudflare Zero Trust Dashboard |

---

## Sicherheitshinweise

- `SESSION_SECRET` und `ADMIN_PASSWORD` **nie** in Git einchecken.
- `.env` ist in `.gitignore` und `.dockerignore`.
- Hinter Cloudflare Tunnel läuft die App nur intern — keine direkte Erreichbarkeit ohne Tunnel.
- `TRUST_PROXY=true` nur setzen wenn tatsächlich ein vertrauenswürdiger Proxy vorgelagert ist.

---

## NPM-Scripts

| Script | Beschreibung |
|---|---|
| `npm run dev` | Dev-Server mit nodemon |
| `npm start` | Produktions-Start |
| `npm test` | Jest-Tests |
| `npm run lint` | ESLint + Prettier |
| `npm run seed` | Migrationen + Demo-Daten |
| `npm run migrate` | Nur Migrationen |

---

Details zu Architekturentscheidungen: [DECISIONS.md](./DECISIONS.md)
