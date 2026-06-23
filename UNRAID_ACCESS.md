# Unraid Server — Zugriff & Deployment

---

## Chabisberg — Installation & Betrieb

### Installierter Stand (2026-06-22)

**App-Verzeichnis:** `/mnt/user/appdata/chabisberg-app`
**Appdata (Daten):** `/mnt/user/appdata/chabisberg/{db,uploads,thumbnails}`
**Container-Name:** `chabisberg`
**Port:** `0.0.0.0:3000` (erreichbar im LAN unter `http://192.168.0.4:3000`)
**Docker Compose:** via Compose Manager Plus (Unraid Community Plugin)

**Admin-Login:**

- Username: `admin`
- Passwort: `Chabisberg2025!` ← nach erstem Login ändern!

### Wie es installiert wurde

```bash
# 1. Repo war bereits geklont (via Compose Manager Plus oder manuell)
cd /mnt/user/appdata/chabisberg-app

# 2. Appdata-Verzeichnisse
mkdir -p /mnt/user/appdata/chabisberg/db
mkdir -p /mnt/user/appdata/chabisberg/uploads
mkdir -p /mnt/user/appdata/chabisberg/thumbnails

# 3. .env erstellt (Inhalt siehe unten)
cp .env.example .env
nano .env

# 4. Image gebaut + Container gestartet (nur chabisberg, kein cloudflared)
docker compose up -d chabisberg --build

# Migrationen + Seed laufen automatisch beim ersten Start
```

**Inhalt der .env auf dem Server:**

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=<generiert mit: openssl rand -hex 48>
DATABASE_PATH=/data/db/chabisberg.sqlite
UPLOAD_DIR=/data/uploads
THUMBNAIL_DIR=/data/thumbnails
MAX_UPLOAD_SIZE_MB=90
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Chabisberg2025!
TRUST_PROXY=true
DATA_DB_PATH=/mnt/user/appdata/chabisberg/db
DATA_UPLOADS_PATH=/mnt/user/appdata/chabisberg/uploads
DATA_THUMBNAILS_PATH=/mnt/user/appdata/chabisberg/thumbnails
HOST_PORT=0.0.0.0:3000
CLOUDFLARE_TUNNEL_TOKEN=unused
```

> **Hinweis `CLOUDFLARE_TUNNEL_TOKEN=unused`:** Der bestehende Eselloch-Tunnel übernimmt das Routing. Der `cloudflared`-Service im docker-compose wird NICHT gestartet. Token-Wert ist ein Platzhalter damit die `compose up chabisberg` Validierung nicht fehlschlägt.

> **Hinweis `HOST_PORT=0.0.0.0:3000`:** Statt `127.0.0.1:3000` — notwendig damit der Eselloch-Tunnel von `192.168.0.4:3000` aus routen kann.

### Bekannte Probleme & Fixes

**Problem: `better-sqlite3` Build-Fehler im Docker**

- Ursache: `node:20-alpine` hat kein Python/gcc → node-gyp schlägt fehl
- Ursache 2: `node:20-slim` (Debian) hat auch kein Python standardmässig
- Fix: Im `Dockerfile` im `deps`-Stage `apt-get install -y python3 make g++` hinzugefügt
- Commit: `fix: add python3/make/g++ via apt-get in deps stage for node-gyp`

**Problem: Login 403 / CSRF invalid token**

- Ursache: Cookie-Name `__Host-csrf` mit `Secure`-Flag — Browser verwirft Secure-Cookies über HTTP
- Fix: Cookie auf einfachen Namen `csrf` ohne Prefix und ohne `Secure`-Flag umgestellt
- CSRF-Schutz bleibt intakt via HMAC-signiertes Double-Submit + `SameSite=Lax`
- Commit: `fix: use plain 'csrf' cookie name instead of __Host-csrf`

### Update / Patchen

```bash
ssh root@192.168.0.4
cd /mnt/user/appdata/chabisberg-app

# 1. Neueste Version holen
git pull

# 2. Image neu bauen + Container neu starten
docker compose up -d chabisberg --build

# Migrationen laufen automatisch beim Neustart
```

Logs während/nach dem Start:

```bash
docker logs -f chabisberg
```

Erwartete Ausgabe:

```
Chabisberg running on port 3000 [production]
```

### Cloudflare Tunnel (TODO)

Die App läuft intern auf Port 3000. Für externen Zugriff via Domain muss der bestehende
**Eselloch-Tunnel** um eine neue Ingress-Regel ergänzt werden:

- Subdomain: `chabisberg.prozessdigital.ch` (oder andere Wahl)
- Service: `http://192.168.0.4:3000`

Dazu Cloudflare API Key benötigt (Global API Key aus dash.cloudflare.com → Profile → API Tokens).
Danach via API-Calls aus `UNRAID_ACCESS.md` (Abschnitt "Neue Subdomain via API hinzufügen").

### Container-Verwaltung

```bash
# Status
docker ps | grep chabisberg

# Logs
docker logs chabisberg
docker logs -f chabisberg   # live

# Neustart
docker restart chabisberg

# Stoppen
docker compose -f /mnt/user/appdata/chabisberg-app/docker-compose.yml stop chabisberg

# Komplett entfernen (Daten bleiben in /mnt/user/appdata/chabisberg/)
docker compose -f /mnt/user/appdata/chabisberg-app/docker-compose.yml down
```

---

## Server

- **IP:** `192.168.0.4`
- **Unraid WebGUI:** `http://192.168.0.4` (Port 80)
- **SSH:** Port 22, aktiv

## SSH-Zugriff

Key-Auth ist eingerichtet — nur dieser Rechner kann ohne Passwort verbinden:

```bash
ssh root@192.168.0.4
```

Der private Key liegt unter `~/.ssh/id_ed25519`. Andere Geräte im Netzwerk benötigen weiterhin das Root-Passwort. Password-Login ist noch aktiv (kann bei Bedarf deaktiviert werden: `PasswordAuthentication no` in `/etc/ssh/sshd_config`).

---

## SMB Share mounten

Der Share `JanickWebsite` ist anonym lesbar, aber nur mit Guest-Mount beschreibbar (root-Credentials funktionieren für SMB nicht direkt — Unraid SMB-Passwort ist separat vom WebGUI-Passwort).

```bash
sudo mkdir -p /mnt/janickwebsite
sudo mount -t cifs //192.168.0.4/JanickWebsite /mnt/janickwebsite \
  -o guest,uid=$(id -u),gid=$(id -g),vers=3.0
```

### Wichtig: Verzeichnisse

Neue Unterverzeichnisse in `www/` müssen **im Unraid-Terminal** erstellt werden (Guest-Mount hat dort keine Schreibrechte):

```bash
# Im Unraid-Terminal (WebGUI → Terminal-Icon)
mkdir -p /mnt/user/JanickWebsite/www/NEUESVERZEICHNIS
chmod 777 /mnt/user/JanickWebsite/www/NEUESVERZEICHNIS
```

Danach können Dateien normal über den gemounteten Share geschrieben werden.

### Share-Struktur

```
JanickWebsite/
├── www/                   → Web-Root (/config/www im Container)
│   ├── index.html         → Hauptseite (prozessdigital.ch)
│   ├── style.css
│   └── neonverse/         → Subdomain neonverse.prozessdigital.ch
│       └── index.html
├── nginx/
│   ├── site-confs/        → Nginx vHost-Configs
│   │   ├── default.conf   → Haupt-vHost
│   │   └── neonverse.conf → Subdomain-vHost
│   ├── nginx.conf
│   └── ssl.conf
├── php/
└── log/
```

---

## Nginx Docker Container

- **Container-Name:** `JanickWebsite`
- **Image:** `lscr.io/linuxserver/nginx`
- **Ports:** `0.0.0.0:8081->80`, `0.0.0.0:8443->443`
- **Volume:** `JanickWebsite` Share → `/config` im Container

### Neue Subdomain hinzufügen

1. Neue Config in `nginx/site-confs/NAME.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name NAME.prozessdigital.ch;

    include /config/nginx/ssl.conf;

    root /config/www/NAME;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ /\.ht {
        deny all;
    }
}
```

2. Nginx neu laden:

```bash
# Im Unraid-Terminal
docker exec JanickWebsite nginx -s reload
```

---

## Cloudflare Tunnel

- **Tunnel-Name:** `Eselloch`
- **Tunnel-ID:** `271fd04c-04cb-4222-91e9-f3782326a66e`
- **Account-ID:** `7da8c7ad6a016e35682db396c329cfa9`
- **Zone-ID (prozessdigital.ch):** `3c86152db57b1bad943d4f9f4b9fb945`
- **Alle Ingress-Regeln zeigen auf:** `http://192.168.0.4:8081`

### Neue Subdomain via API hinzufügen

```bash
# 1. Tunnel-Ingress aktualisieren (bestehende Regeln + neue)
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/cfd_tunnel/TUNNEL_ID/configurations" \
  -H "X-Auth-Email: EMAIL" \
  -H "X-Auth-Key: API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {"hostname": "prozessdigital.ch",         "service": "http://192.168.0.4:8081"},
        {"hostname": "www.prozessdigital.ch",      "service": "http://192.168.0.4:8081"},
        {"hostname": "neonverse.prozessdigital.ch","service": "http://192.168.0.4:8081"},
        {"hostname": "NEUE-SUBDOMAIN.prozessdigital.ch", "service": "http://192.168.0.4:8081"},
        {"service": "http_status:404"}
      ],
      "warp-routing": {"enabled": false}
    }
  }'

# 2. DNS CNAME-Record erstellen
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "X-Auth-Email: EMAIL" \
  -H "X-Auth-Key: API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "NEUE-SUBDOMAIN",
    "content": "271fd04c-04cb-4222-91e9-f3782326a66e.cfargotunnel.com",
    "proxied": true
  }'
```

---

## Kompletter Ablauf für neue Subdomain

1. **Web-Verzeichnis erstellen** (Unraid-Terminal):
   ```bash
   mkdir -p /mnt/user/JanickWebsite/www/NAME && chmod 777 /mnt/user/JanickWebsite/www/NAME
   ```
2. **Share mounten** (lokal): siehe oben
3. **Dateien kopieren** (lokal):
   ```bash
   cp ./index.html /mnt/janickwebsite/www/NAME/
   ```
4. **nginx Config schreiben** (lokal):
   ```bash
   cp neonverse.conf /mnt/janickwebsite/nginx/site-confs/NAME.conf
   ```
5. **nginx reload** (Unraid-Terminal):
   ```bash
   docker exec JanickWebsite nginx -s reload
   ```
6. **Cloudflare Tunnel + DNS** via API (siehe oben)
