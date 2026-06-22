# Chabisberg — Build-Instruktionen (Claude Code)

**App:** Kleine Quartier-Plattform. Nachbarn auf interaktiver Karte, Kontaktdaten, News-Stream.
**Deploy:** Self-hosted Unraid (Docker), Zugriff via Cloudflare Tunnel.
**Sprache:** Antworten auf Deutsch. Code/Kommentare Englisch.

---

## 0. Arbeitsweise (PFLICHT — zuerst lesen)

- Caveman-Modus aktiv: kurze, fragmentarische Prosa. Code/Befehle/Pfade bleiben exakt und vollständig. **Ausnahme:** Autorisierungs- und Security-Logik immer ausführlich kommentieren, nie verkürzen.
- Arbeite autonom. Rückfrage NUR bei blockierender Unklarheit. Sonst sinnvolle Defaults treffen und in `DECISIONS.md` notieren.
- Nach jedem sinnvollen Schritt: `npm run lint && npm test`, dann `git commit`. Bei rotem Test/Lint: selbst fixen, nicht fragen.
- Niemals `git push`, kein Deploy auf Unraid, keine echten Secrets. Das macht der User.
- Halte Code modular + kommentiert. Tests für kritische Logik.

---

## 1. Scope

Web-App mit:
1. **Karte** — Nachbarn als klickbare POIs.
2. **Login** — pro Adresse, verwaltet nur diese Adresse.
3. **Admin-Konsole** — Adressen, User, Posts, Token.
4. **News-Stream** — Posts, Anhänge (max 90 MB), Bild-Galerie. Speicherung auf Server-Volume.

Landing Page: Bereiche "News" + "Karte". Admins sehen zusätzlich Admin-Bereich.
Einfach, robust, self-contained. Keine SaaS ausser OSM-Tiles. Alle Daten lokal.

---

## 2. Stack (Vorgabe)

- **Backend:** Node.js + Express. Single-Service.
- **DB:** SQLite + Knex (oder Prisma). Ein Volume.
- **Frontend:** Server-rendered (EJS) ODER leichtes SPA ohne komplexen Build. Wahl in README begründen.
- **Karte:** Leaflet + OSM-Tiles. Kein API-Key.
- **Auth:** `express-session`, HTTP-only Cookies. Passwörter `bcrypt`.
- **Uploads:** `multer`. Bilder-Thumbnails mit `sharp`.

Abweichung vom Stack → in README begründen.

---

## 3. Datenmodell

### `addresses`
`id` (PK) · `street` · `house_number` · `postal_code` · `city` · `lat` · `lng` (Default: manuell per Pin-Klick in Admin/Edit setzbar; Geocoding optional) · `display_name` (z.B. "Familie Müller") · `created_at` · `updated_at`

### `residents`
`id` (PK) · `address_id` (FK→addresses, 1:n) · `display_name` (z.B. "Markus Müller") · `phone` (optional) · `picture` (Bild, beim Resident angezeigt) · `claim` (optional, kurzer Text: Person/Skills/Beruf) · `type` (Erwachsener|Kind|Katze|Hund) · `birthday` (optional, für Alter/Geburtstagsliste) · `showbirthday` (bool; bei Tieren immer false)

### `users`
`id` (PK) · `username`/`email` · `password_hash` · `address_id` (FK→addresses, n:1 — mehrere User pro Adresse erlaubt) · `role` (resident|admin) · `created_at`

### `posts`
`id` (PK) · `author_user_id` (FK→users) · `title` · `body` (Rich-Text) · `hyperlink` (optional) · `created_at` · `updated_at`

### `attachments`
`id` (PK) · `post_id` (FK→posts) · `filename` · `stored_path` · `mime_type` · `size_bytes` · `is_image` (bool) · `created_at`

### `tokens` (Registrierungs-Token)
`id` (PK) · `token` (~6 Zeichen) · `used` (bool) · `created_at` · `used_by_user_id` (optional)

**Kernregel (serverseitig erzwingen, bei JEDEM schreibenden Request):**
- resident bearbeitet AUSSCHLIESSLICH Daten seiner verknüpften `address_id`.
- User mit Adresse darf weitere User mit derselben Adresse verknüpfen (z.B. Ehepartner berechtigen).
- Nie nur im Frontend prüfen.

---

## 4. Features

### 4.1 Karte
- Leaflet, auf Quartier zentriert, sinnvoller Default-Zoom.
- Marker je Adresse mit lat/lng.
- Popup: `display_name`, volle Adresse, Liste der `residents` (mit Bild/claim).
- Daten via `GET /api/addresses` — nur eingeloggt.

### 4.2 Login
- Username/Passwort. Session-Cookie. "Eingeloggt bleiben" optional. Logout.
- Kein Self-Signup. Erst-Registrierung via Token (~6 Zeichen, Admin generiert). Bei Registrierung wählt User seine Adresse.

### 4.3 Admin-Konsole (`/admin`, nur role=admin)
- Adressen: anlegen/bearbeiten/löschen inkl. Koordinaten (Pin-Klick auf Karte).
- User: anlegen, Adresse zuweisen, Passwort-Reset, Rolle setzen, Registrierungs-Token generieren.
- Posts moderieren/löschen.
- Übersicht Uploads/Speichernutzung.

### 4.4 News-Stream
- Chronologisch, neueste zuerst.
- Eingeloggt: posten mit Titel (optional), Rich-Text-Body, optional Hyperlink, beliebig viele Anhänge.
- **Anhang max 90 MB** (ENV-steuerbar). Validieren, ablehnen wenn grösser.
- Bild-Anhänge → Galerie/Thumbnail-Grid, Klick → Lightbox. Thumbnails serverseitig (`sharp`).
- Anhänge auf Volume, NICHT in DB. DB hält nur Metadaten + Pfad.

### 4.5 Eigene Adresse + Residents
- User verwalten ihre `addresses`: nur `display_name` änderbar, Rest nicht.
- User verwalten `residents` ihrer Adresse: anlegen/bearbeiten/löschen.

---

## 5. Volumes

- `/data/db` → SQLite
- `/data/uploads` → Originale
- `/data/thumbnails` → Thumbnails

Als Docker-Volumes nach aussen mappen (Unraid: `/mnt/user/appdata/chabisberg/...`).

---

## 6. Deploy: Unraid + Cloudflare Tunnel

- Liefere `Dockerfile` + `docker-compose.yml`.
- Port via ENV `PORT` (Default 3000).
- App NICHT direkt exponiert. Hinter Cloudflare Tunnel:
  - intern erreichbar (`http://chabisberg:3000`)
  - `cloudflared`-Connector leitet Domain → internen Port
  - hinter Reverse Proxy: `app.set('trust proxy', true)`, Cookie-Flags `Secure`+`SameSite` korrekt.
- README: Volume-Mapping Unraid, ENV, Cloudflare-Tunnel (Public Hostname → Service).

**Cloudflare-Limit:** Free-Plan ~100 MB pro Request. 90-MB-Limit liegt knapp drunter → ok. In README vermerken, dass Tunnel die harte Obergrenze ist.

---

## 7. Security (PFLICHT)

- Passwörter `bcrypt`, nie Klartext.
- Autorisierung serverseitig: resident nur eigene Adresse.
- CSRF-Schutz bei Formularen.
- Upload: MIME prüfen, Dateinamen sanitizen, keine ausführbaren Pfade, 90-MB-Cap.
- Rate-Limiting auf Login.
- Kontaktdaten (Name/Adresse/Telefon) nur für eingeloggte User. Nie öffentlich.

---

## 8. ENV (`.env.example` mitliefern)

```
PORT=3000
SESSION_SECRET=changeme
DATABASE_PATH=/data/db/chabisberg.sqlite
UPLOAD_DIR=/data/uploads
THUMBNAIL_DIR=/data/thumbnails
MAX_UPLOAD_SIZE_MB=90
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme   # nur Seeding
TRUST_PROXY=true
```

---

## 9. NPM-Scripts (anlegen, müssen verlässlich laufen)

`npm run dev` (Dev-Start) · `npm test` · `npm run lint` · `npm run build` · `npm run seed` (Admin + Demo-Daten)

ESLint + Prettier einrichten. Diese Scripts sind die Selbstkontroll-Schleife — nach jeder Änderung laufen lassen.

---

## 10. Liefergegenstände

- [ ] Source (Backend + Frontend)
- [ ] `Dockerfile` + `docker-compose.yml` (cloudflared dokumentiert)
- [ ] `.env.example`
- [ ] Migrationen + Seed (initialer Admin)
- [ ] `README.md` (lokal, Docker, Unraid, Cloudflare, ENV)
- [ ] `DECISIONS.md` (getroffene Defaults)
- [ ] Tests für Autorisierungslogik
- [ ] Funktionierend: Karte, Login, Token-Registrierung, Admin, News-Stream + Galerie

---

## 11. Reihenfolge

1. Projektstruktur + Datenmodell + Migrationen + npm-Scripts + Lint.
2. Auth + Autorisierung (kritisch — ausführlich, mit Tests).
3. Admin-Konsole.
4. Karte.
5. News-Stream + Galerie.
6. Docker/Compose + README + DECISIONS.

Commit nach jedem Schritt. Test + Lint grün halten.
