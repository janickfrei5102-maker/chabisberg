# Chabisberg — Entwicklungs-Prompts & Checkpoints

Jeder Prompt startet mit `/caveman` (full-Level empfohlen). Reihenfolge einhalten.
Nach jedem Checkpoint: selbst prüfen, erst weiter wenn grün.
Bei Auth/Security (Phase 2) gilt: Caveman komprimiert die Prosa, ABER die Logik bleibt ausführlich kommentiert + getestet.

---

## Phase 0 — Init & Gerüst

**Prompt:**
```
/caveman Lies CLAUDE.md vollständig. Erstelle das Projektgerüst:
Ordnerstruktur, package.json, Express-Setup, SQLite via Knex,
Migrationen für ALLE Tabellen aus dem Datenmodell (addresses, residents,
users, posts, attachments, tokens) inkl. FKs und Constraints.
Richte ein: npm-Scripts (dev, test, lint, build, seed), ESLint, Prettier,
.gitignore, .env.example. Lege DECISIONS.md an für getroffene Defaults.
Begründe Frontend-Wahl (EJS vs SPA) kurz im README.
Committe am Ende. Stell Rückfragen NUR bei blockierender Unklarheit.
```

**✅ Checkpoint 0:**
- [ ] `npm install` läuft fehlerfrei
- [ ] `npm run dev` startet Server (auch wenn noch leer)
- [ ] `npm run lint` grün
- [ ] Alle 6 Tabellen als Migration vorhanden, Migration läuft durch
- [ ] `.env.example`, `.gitignore`, `DECISIONS.md` da
- [ ] Frontend-Entscheidung im README begründet
- [ ] Git-Commit gemacht

> Vor Phase 1: DECISIONS.md kurz durchlesen. Defaults ok? Sonst jetzt korrigieren.

---

## Phase 1 — Seed & DB-Layer

**Prompt:**
```
/caveman Baue den DB-Zugriffslayer (Queries/Repositories) für alle Tabellen.
Schreibe ein Seed-Script (npm run seed): legt initialen Admin aus ENV an,
plus 2-3 Demo-Adressen mit Residents und ein paar Registrierungs-Token.
Schreibe Unit-Tests für den DB-Layer. Committe.
```

**✅ Checkpoint 1:**
- [ ] `npm run seed` legt Admin + Demo-Daten an
- [ ] Admin existiert in DB mit gehashtem Passwort (bcrypt, kein Klartext)
- [ ] `npm test` grün
- [ ] Commit gemacht

---

## Phase 2 — Auth & Autorisierung (KRITISCH)

**Prompt:**
```
/caveman Baue Authentifizierung + Autorisierung. ACHTUNG: Diese Logik
ausführlich kommentieren, NICHT verkürzen.
- Login (username/email + Passwort, bcrypt-Check), express-session,
  HTTP-only Cookie, "eingeloggt bleiben" optional, Logout.
- Token-Registrierung: User wählt bei Erst-Anmeldung Adresse + verbraucht Token.
- Autorisierungs-Middleware: resident darf NUR Daten seiner address_id schreiben.
  User mit Adresse darf weitere User derselben Adresse verknüpfen.
  Admin darf alles. Serverseitig erzwingen, nie nur Frontend.
- Rate-Limiting auf Login. CSRF-Schutz bei Formularen.
Schreibe gründliche Tests für die Autorisierungsregeln:
fremde Adresse schreiben MUSS fehlschlagen. Committe.
```

**✅ Checkpoint 2 (genau prüfen):**
- [ ] Login/Logout funktioniert manuell im Browser
- [ ] Token-Registrierung funktioniert, verbrauchter Token nicht wiederverwendbar
- [ ] **Test: resident kann fremde address_id NICHT bearbeiten (muss 403 sein)**
- [ ] **Test: resident kann eigene Adresse bearbeiten**
- [ ] **Test: User kann Co-User für eigene Adresse anlegen**
- [ ] Passwörter nur als bcrypt-Hash in DB
- [ ] Rate-Limit auf Login greift
- [ ] `npm test` grün, Commit gemacht

> Hier wirklich selbst draufschauen. Das ist das Herzstück der Datensicherheit (echte Nachbarn-Kontaktdaten).

---

## Phase 3 — Admin-Konsole

**Prompt:**
```
/caveman Baue die Admin-Konsole unter /admin (nur role=admin, sonst 403).
- Adressen: anlegen/bearbeiten/löschen, Koordinaten per Pin-Klick auf
  kleiner Leaflet-Karte setzen.
- User: anlegen, Adresse zuweisen, Passwort-Reset, Rolle setzen,
  Registrierungs-Token generieren (~6 Zeichen).
- Posts: auflisten, löschen (Moderation).
- Übersicht: Anzahl Uploads + belegter Speicher.
Tests für Admin-Zugriffsschutz. Committe.
```

**✅ Checkpoint 3:**
- [ ] Nicht-Admin bekommt auf /admin ein 403
- [ ] Admin kann Adresse anlegen + Pin-Koordinaten setzen
- [ ] Admin kann Token generieren, Token funktioniert bei Registrierung
- [ ] Admin kann Post löschen
- [ ] Speicher-Übersicht zeigt plausible Zahlen
- [ ] `npm test` grün, Commit gemacht

---

## Phase 4 — Karte

**Prompt:**
```
/caveman Baue die interaktive Karte (Leaflet + OSM-Tiles, kein API-Key).
- Zentriert auf Quartier, sinnvoller Default-Zoom.
- Marker je Adresse mit lat/lng.
- Popup: display_name, volle Adresse, Liste der residents (mit Bild + claim).
- Daten via GET /api/addresses, nur für eingeloggte User (sonst 401).
Committe.
```

**✅ Checkpoint 4:**
- [ ] Karte lädt, Marker erscheinen für Demo-Adressen
- [ ] Popup zeigt Adresse + Resident-Liste mit Bildern
- [ ] `/api/addresses` ohne Login gibt 401
- [ ] Adresse ohne Koordinaten crasht die Karte nicht
- [ ] Commit gemacht

---

## Phase 5 — Eigene Adresse & Residents verwalten

**Prompt:**
```
/caveman Baue die Selbstverwaltung für eingeloggte User:
- Eigene Adresse: nur display_name änderbar, Rest gesperrt.
- Residents der eigenen Adresse: anlegen/bearbeiten/löschen
  (display_name, phone, picture-Upload, claim, type, birthday, showbirthday).
  Bei type=Katze/Hund ist showbirthday immer false (erzwingen).
- Bild-Upload für Resident-picture mit sharp-Thumbnail.
Autorisierung serverseitig prüfen (nur eigene Adresse). Tests. Committe.
```

**✅ Checkpoint 5:**
- [ ] User kann nur display_name der eigenen Adresse ändern, nicht Strasse etc.
- [ ] User kann Resident anlegen/löschen für eigene Adresse
- [ ] **Test: Resident-Anlage für fremde Adresse schlägt fehl (403)**
- [ ] Tier-Resident hat showbirthday=false erzwungen
- [ ] Resident-Bild wird hochgeladen + Thumbnail erzeugt
- [ ] `npm test` grün, Commit gemacht

---

## Phase 6 — News-Stream & Galerie

**Prompt:**
```
/caveman Baue den News-Stream.
- Liste aller Posts, neueste zuerst.
- Posten (eingeloggt): Titel optional, Rich-Text-Body, optional Hyperlink,
  beliebig viele Anhänge.
- Anhang max 90 MB (ENV MAX_UPLOAD_SIZE_MB), serverseitig validieren,
  zu grosse ablehnen. MIME prüfen, Dateinamen sanitizen.
- Anhänge auf /data/uploads speichern, NICHT in DB (nur Metadaten+Pfad).
- Bild-Anhänge: Galerie/Thumbnail-Grid (sharp), Klick öffnet Lightbox.
Committe.
```

**✅ Checkpoint 6:**
- [ ] Post mit Text + Hyperlink erstellbar, erscheint oben
- [ ] Mehrere Anhänge pro Post möglich
- [ ] Datei >90 MB wird sauber abgelehnt (klare Fehlermeldung, kein Crash)
- [ ] Bilder erscheinen als Galerie, Lightbox öffnet bei Klick
- [ ] Anhänge liegen auf Volume, DB hält nur Pfade
- [ ] Commit gemacht

---

## Phase 7 — Landing Page & Verdrahtung

**Prompt:**
```
/caveman Baue die Landing Page: Bereiche "News" und "Karte" sichtbar,
Admin-Bereich nur für role=admin. Navigation, Login-Status, Logout-Button.
Räume die Routen auf, stelle konsistentes Layout sicher. Committe.
```

**✅ Checkpoint 7:**
- [ ] Eingeloggt: News + Karte sichtbar
- [ ] Admin: zusätzlich Admin-Link
- [ ] Ausgeloggt: nur Login-Seite erreichbar, alles andere geschützt
- [ ] Navigation funktioniert durchgängig
- [ ] Commit gemacht

---

## Phase 8 — Docker, Compose & Doku

**Prompt:**
```
/caveman Erstelle Dockerfile + docker-compose.yml.
- App auf Port via ENV (Default 3000), trust proxy = true.
- Volumes /data/db, /data/uploads, /data/thumbnails nach aussen mappen
  (Unraid-Pfad-Beispiel /mnt/user/appdata/chabisberg/...).
- cloudflared als Beispiel-Service ODER dokumentiert.
Schreibe README: lokaler Start, Docker-Start, Unraid-Setup,
Cloudflare-Tunnel (Public Hostname -> interner Service), ENV-Erklärung.
Vermerk: Cloudflare Free ~100MB Request-Limit, daher 90MB Cap.
Aktualisiere DECISIONS.md. Committe.
```

**✅ Checkpoint 8:**
- [ ] `docker compose up` startet App lokal
- [ ] Daten überleben Container-Neustart (Volumes greifen)
- [ ] README deckt alle 5 Punkte ab
- [ ] Cloudflare-Limit dokumentiert
- [ ] Commit gemacht

> Erst NACH grünem Checkpoint 8: du selbst deployst auf Unraid + richtest Cloudflare Tunnel ein. Das macht Claude NICHT.

---

## Phase 9 — Härtung & Abschluss

**Prompt:**
```
/caveman Finale Durchsicht. Prüfe gegen Abschnitt 7 (Security) der CLAUDE.md:
bcrypt, serverseitige Autorisierung, CSRF, Upload-Validierung, Rate-Limit,
Kontaktdaten nur eingeloggt. Liste gefundene Lücken in DECISIONS.md und fixe sie.
Stelle sicher: npm test deckt alle Autorisierungsregeln ab. Committe.
```

**✅ Checkpoint 9 (final):**
- [ ] Alle Security-Punkte aus CLAUDE.md §7 erfüllt
- [ ] Keine Kontaktdaten ohne Login abrufbar (auch nicht via direkte API-URL)
- [ ] `npm test` grün, gute Abdeckung der Auth-Logik
- [ ] `npm run lint` grün
- [ ] README + DECISIONS.md aktuell
- [ ] Sauberer finaler Commit

---

## Allgemeine Tipps

- **Eine Phase pro Session.** Nicht alles auf einmal. Zwischen den Phasen Kontext mit `/compact` aufräumen, spart Input-Tokens.
- **Bei rotem Test:** `/caveman Test X schlägt fehl: <Fehler>. Fix.` — Claude repariert selbst.
- **Wenn Claude abdriftet:** zurück zur CLAUDE.md verweisen: `/caveman Halte dich an CLAUDE.md Abschnitt N.`
- **Caveman-Ausnahme:** Wenn du bei Auth/Security die Begründung NICHT verstehst, kurz `erklär ausführlich` dranhängen — dort lohnt sich Klarheit mehr als Token-Sparen.
- **Checkpoints sind dein Sicherheitsnetz.** Nicht überspringen. Lieber eine Phase länger, als auf wackligem Fundament weiterbauen.
