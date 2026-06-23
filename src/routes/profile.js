/**
 * Profile / self-management routes for authenticated residents.
 *
 * Security contract:
 * ──────────────────
 * - All routes are behind requireAuth (session required).
 * - Address updates: only the user's own address_id (from session) is touched.
 *   No address_id param is accepted from the request body for address updates.
 * - Resident CRUD: requireOwnsAddress resolves the resident's address_id from the
 *   DB and compares it to the session user's address_id. A resident can never
 *   modify residents belonging to a different address, even by crafting a direct
 *   POST to /profile/residents/:id with a foreign ID.
 * - address_id on resident create is always taken from session, never from body.
 *   This prevents a resident from creating a resident at someone else's address.
 */

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const { requireAuth, requireOwnsAddress } = require('../middleware/requireAuth');
const {
  uploadPicture,
  createResidentThumbnail,
  deleteResidentPicture,
} = require('../middleware/upload');
const { addresses, residents, users } = require('../db/repos');

const router = express.Router();

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

// Every route in this file requires login
router.use(requireAuth);

/**
 * Helper: user must have an address assigned to manage residents.
 * Users without an address (e.g., admin accounts not tied to an address)
 * get a clear error instead of a confusing empty page.
 */
function requireAddressAssigned(req, res, next) {
  if (!req.session.user.address_id) {
    return res.status(403).render('error', {
      message: 'Keine Adresse zugewiesen. Bitte Admin kontaktieren.',
      status: 403,
    });
  }
  next();
}

/**
 * Factory middleware: verify that the resident being accessed belongs to
 * the session user's address. Admin bypasses (handled inside requireOwnsAddress).
 * Returns 404 if the resident doesn't exist (avoids leaking existence of IDs).
 */
const ownsResident = requireOwnsAddress(async (req) => {
  const resident = await residents.findById(req.params.id);
  return resident?.address_id; // null/undefined → 404
});

// ─── Profile Overview ─────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    /**
     * Re-read address_id from DB rather than trusting the session cache.
     * The session stores address_id at login time — if an admin later assigns
     * or changes the address on this account, the session value is stale.
     * A live DB lookup always reflects the current state.
     */
    const currentUser = await users.findById(req.session.user.id);
    const addressId = currentUser?.address_id;

    if (!addressId) {
      return res.status(403).render('error', {
        message: 'Keine Adresse zugewiesen. Bitte Admin kontaktieren.',
        status: 403,
      });
    }

    // Also refresh session so subsequent requests (resident CRUD) use live address_id
    req.session.user = {
      id: currentUser.id,
      username: currentUser.username,
      role: currentUser.role,
      address_id: currentUser.address_id,
    };

    const [address, residentList] = await Promise.all([
      addresses.findById(addressId),
      residents.findByAddressId(addressId),
    ]);
    res.render('profile/index', {
      address,
      residents: residentList,
      message: req.query.message || null,
      password_error: req.query.password_error || null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Password change ──────────────────────────────────────────────────────────

router.post('/password', async (req, res, next) => {
  const { current_password, new_password, new_password_confirm } = req.body;
  const redirect = (msg) => res.redirect(`/profile?password_error=${encodeURIComponent(msg)}`);

  if (!current_password || !new_password || !new_password_confirm) {
    return redirect('Alle Felder ausfüllen.');
  }
  if (new_password.length < 8) {
    return redirect('Neues Passwort muss mindestens 8 Zeichen haben.');
  }
  if (new_password !== new_password_confirm) {
    return redirect('Neue Passwörter stimmen nicht überein.');
  }

  try {
    const currentUser = await users.findById(req.session.user.id);
    const valid = await bcrypt.compare(current_password, currentUser.password_hash);
    if (!valid) {
      return redirect('Aktuelles Passwort falsch.');
    }
    const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await users.update(req.session.user.id, { password_hash: hash });
    res.redirect('/profile?message=Passwort+ge%C3%A4ndert');
  } catch (err) {
    next(err);
  }
});

// ─── Address: update display_name only ────────────────────────────────────────

router.post('/address', requireAddressAssigned, async (req, res, next) => {
  const { display_name } = req.body;
  try {
    /**
     * Only display_name is writable by residents. Street, house_number,
     * postal_code, city, lat, lng are admin-only to prevent residents from
     * moving their pin to a false location or changing their civic address.
     * We explicitly whitelist what we accept — ignoring all other body fields.
     */
    await addresses.update(req.session.user.address_id, {
      display_name: display_name?.trim() || null,
    });
    res.redirect('/profile?message=Anzeigename+gespeichert');
  } catch (err) {
    next(err);
  }
});

// ─── Residents ────────────────────────────────────────────────────────────────

router.get('/residents/new', requireAddressAssigned, (_req, res) => {
  res.render('profile/resident_form', { resident: null, error: null });
});

router.post(
  '/residents',
  requireAddressAssigned,
  uploadPicture.single('picture'),
  async (req, res, next) => {
    let thumbFilename = null;
    try {
      // Process uploaded picture if present
      if (req.file) {
        thumbFilename = await createResidentThumbnail(req.file.path, req.file.filename);
      }

      const { display_name, phone, claim, type, birthday, showbirthday } = req.body;
      const ANIMAL_TYPES = ['Katze', 'Hund'];
      const isAnimal = ANIMAL_TYPES.includes(type);

      await residents.create({
        // address_id always comes from session — never from request body
        address_id: req.session.user.address_id,
        display_name: display_name?.trim(),
        phone: phone?.trim() || null,
        claim: claim?.trim() || null,
        type: type || 'Erwachsener',
        birthday: birthday || null,
        // Enforce: animals never show birthday (DB layer also enforces, belt-and-suspenders)
        showbirthday: isAnimal ? false : showbirthday === 'on',
        picture: thumbFilename,
      });

      res.redirect('/profile?message=Bewohner+angelegt');
    } catch (err) {
      // Clean up uploaded file on error to avoid orphaned files
      if (thumbFilename) await deleteResidentPicture(thumbFilename).catch(() => {});
      next(err);
    }
  }
);

router.get('/residents/:id/edit', ownsResident, async (req, res, next) => {
  try {
    const resident = await residents.findById(req.params.id);
    if (!resident)
      return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
    res.render('profile/resident_form', { resident, error: null });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/residents/:id',
  ownsResident,
  uploadPicture.single('picture'),
  async (req, res, next) => {
    try {
      const existing = await residents.findById(req.params.id);
      if (!existing)
        return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });

      let thumbFilename = existing.picture; // keep existing picture by default

      if (req.file) {
        // New picture uploaded: create thumbnail, then delete old file
        const newThumb = await createResidentThumbnail(req.file.path, req.file.filename);
        if (existing.picture) await deleteResidentPicture(existing.picture).catch(() => {});
        thumbFilename = newThumb;
      }

      const { display_name, phone, claim, type, birthday, showbirthday } = req.body;
      const ANIMAL_TYPES = ['Katze', 'Hund'];
      const effectiveType = type || existing.type;
      const isAnimal = ANIMAL_TYPES.includes(effectiveType);

      await residents.update(req.params.id, {
        display_name: display_name?.trim(),
        phone: phone?.trim() || null,
        claim: claim?.trim() || null,
        type: effectiveType,
        birthday: birthday || null,
        showbirthday: isAnimal ? false : showbirthday === 'on',
        picture: thumbFilename,
      });

      res.redirect('/profile?message=Bewohner+gespeichert');
    } catch (err) {
      next(err);
    }
  }
);

router.post('/residents/:id/delete', ownsResident, async (req, res, next) => {
  try {
    const resident = await residents.findById(req.params.id);
    if (!resident)
      return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });

    // Delete picture files before removing DB record
    if (resident.picture) await deleteResidentPicture(resident.picture).catch(() => {});
    await residents.delete(req.params.id);

    res.redirect('/profile?message=Bewohner+gel%C3%B6scht');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
