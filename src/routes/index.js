const express = require('express');
const path = require('path');
const { requireAuth } = require('../middleware/requireAuth');
const { addresses, posts, attachments } = require('../db/repos');
const { postThumbUrl } = require('../middleware/upload');
const router = express.Router();

const PAGE_SIZE = 20;

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const { rows: postRows, total } = await posts.findAll({ limit: PAGE_SIZE, offset });

    // Batch-load attachments for all posts in one query to avoid N+1
    const postIds = postRows.map((p) => p.id);
    let allAttachments = [];
    if (postIds.length) {
      // Access the knex instance via a known repo pattern: attachments.findByPostId
      // returns only one post's attachments. Use findByPostId per post (small N).
      allAttachments = (
        await Promise.all(postIds.map((id) => attachments.findByPostId(id)))
      ).flat();
    }

    // Group by post_id and enrich with URLs
    const attachByPost = {};
    for (const a of allAttachments) {
      if (!attachByPost[a.post_id]) attachByPost[a.post_id] = [];
      // Derive public URLs from stored_path — no extra DB column needed
      attachByPost[a.post_id].push({
        ...a,
        file_url: `/uploads/${a.stored_path}`,
        thumb_url: a.is_image ? postThumbUrl(a.stored_path) : null,
      });
    }

    const enrichedPosts = postRows.map((p) => ({
      ...p,
      attachments: attachByPost[p.id] || [],
    }));

    res.render('news', {
      postList: enrichedPosts,
      total,
      page,
      pageSize: PAGE_SIZE,
      maxAttachmentMb: parseInt(process.env.MAX_UPLOAD_SIZE_MB) || 90,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/map', requireAuth, (_req, res) => {
  res.render('map');
});

// ─── Address detail view ──────────────────────────────────────────────────────

router.get('/addresses/:id', requireAuth, async (req, res, next) => {
  try {
    const address = await addresses.findByIdWithResidents(req.params.id);
    if (!address)
      return res.status(404).render('error', { message: 'Nicht gefunden', status: 404 });
    res.render('addresses/show', { address });
  } catch (err) {
    next(err);
  }
});

// ─── vCard download per resident ──────────────────────────────────────────────
//
// Returns a RFC 6350 vCard 3.0 file. Browsers on mobile automatically offer to
// add the contact to the device's address book when the MIME type is text/vcard.
//
// Security: requires auth — resident phone numbers and addresses are private.
// No resident-ownership check needed: any logged-in user may save any neighbour's
// contact (that is the explicit feature purpose).

router.get('/addresses/:id/residents/:rid/vcard', requireAuth, async (req, res, next) => {
  try {
    const address = await addresses.findByIdWithResidents(req.params.id);
    if (!address) return res.status(404).send('Not found');

    const resident = address.residents.find((r) => String(r.id) === String(req.params.rid));
    if (!resident) return res.status(404).send('Not found');

    const vcard = buildVCard(resident, address);

    // Sanitise filename: keep only safe chars
    const safe = (resident.display_name || 'kontakt').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '');
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.vcf"`);
    res.send(vcard);
  } catch (err) {
    next(err);
  }
});

/**
 * Build a vCard 3.0 string for a resident.
 * Spec: RFC 2426 / RFC 6350 (3.0 subset — widest device support).
 *
 * Fields included:
 *   FN       — full display name
 *   N        — structured name (surname, given — split on first space)
 *   TEL      — phone if present
 *   ADR      — street + city from linked address
 *   BDAY     — birthday if present and showbirthday is set
 *   NOTE     — claim (Kurzbeschreibung) if present
 *   PHOTO    — skipped (thumbnail path not resolvable to URL without knowing base URL)
 */
function buildVCard(resident, address) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];

  lines.push(`FN:${vcEscape(resident.display_name || '')}`);

  // N field: split "First Last" → Last;First;;; (best-effort)
  const parts = (resident.display_name || '').split(' ');
  const given = parts[0] || '';
  const family = parts.slice(1).join(' ');
  lines.push(`N:${vcEscape(family)};${vcEscape(given)};;;`);

  if (resident.phone) {
    lines.push(`TEL;TYPE=CELL,VOICE:${vcEscape(resident.phone)}`);
  }

  // ADR: ;;street + number;city;;postal;country
  const street = [address.street, address.house_number].filter(Boolean).join(' ');
  lines.push(
    `ADR;TYPE=HOME:;;${vcEscape(street)};${vcEscape(address.city || '')};;${vcEscape(address.postal_code || '')};CH`
  );

  if (resident.birthday && resident.showbirthday) {
    // BDAY format: YYYY-MM-DD
    lines.push(`BDAY:${resident.birthday.toString().slice(0, 10)}`);
  }

  if (resident.claim) {
    lines.push(`NOTE:${vcEscape(resident.claim)}`);
  }

  lines.push('END:VCARD');

  // vCard lines must be CRLF-terminated per RFC
  return lines.join('\r\n') + '\r\n';
}

/** Escape special chars per vCard spec (comma, semicolon, backslash, newline). */
function vcEscape(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

module.exports = router;
