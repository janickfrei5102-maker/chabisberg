/**
 * Multer + Sharp upload middleware.
 *
 * Two upload surfaces:
 *   uploadPicture      — resident profile picture (single, image/* only, 10 MB)
 *   uploadAttachments  — post attachments (multiple, broad allow-list, ENV-configured MB limit)
 *
 * Security considerations (apply to both):
 * ──────────────────────────────────────────
 * 1. MIME type check: client-declared Content-Type, not authoritative. Acceptable
 *    because files are stored with UUID-based names + sanitised extensions — even
 *    a disguised executable cannot be executed from a static-file serve.
 *    Post attachments: explicit block-list for script/executable MIME types.
 *    Resident pictures: allow image/* only.
 *
 * 2. Filenames: user-controlled names are NEVER used as storage paths. Multer
 *    generates UUID-based filenames. Original name stored in DB as display-only.
 *    Extension is stripped of non-alphanumeric chars before appending to UUID.
 *
 * 3. Directory: fixed to UPLOAD_DIR/{residents|posts}/. No user input influences
 *    the directory — path traversal via filename cannot escape the upload root.
 *
 * 4. Size limits:
 *    - Resident pictures: 10 MB (generous for a profile photo).
 *    - Post attachments: MAX_UPLOAD_SIZE_MB env (default 90) — just under
 *      Cloudflare Tunnel's ~100 MB free-plan per-request limit.
 *
 * 5. Sharp thumbnail: always output JPEG regardless of input format. This
 *    sanitises polyglot payloads (e.g., JPEG+HTML) via the transcoding step.
 *    For post attachments, thumbnails are only created for image/* files.
 *
 * 6. Stored-path convention: stored_path in the DB is RELATIVE to UPLOAD_DIR
 *    (e.g. "posts/UUID.pdf"). Full disk path = path.join(UPLOAD_DIR, stored_path).
 *    URL = "/uploads/" + stored_path. This survives UPLOAD_DIR reconfigurations.
 *    Thumbnail URL = "/thumbs/posts/" + UUID + ".jpg" (derived, not stored).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || './thumbnails';

// ─── Resident profile pictures ────────────────────────────────────────────────

const MAX_PICTURE_BYTES = 10 * 1024 * 1024;

const pictureStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    const dir = path.join(UPLOAD_DIR, 'residents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const uuid = crypto.randomUUID();
    const ext =
      path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '') || '.jpg';
    cb(null, uuid + ext);
  },
});

function pictureFileFilter(_req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Nur Bilddateien erlaubt (JPEG, PNG, GIF, WebP)'));
  }
}

const uploadPicture = multer({
  storage: pictureStorage,
  fileFilter: pictureFileFilter,
  limits: { fileSize: MAX_PICTURE_BYTES },
});

async function createResidentThumbnail(originalPath, filename) {
  const thumbDir = path.join(THUMBNAIL_DIR, 'residents');
  await fs.promises.mkdir(thumbDir, { recursive: true });

  const uuid = path.basename(filename, path.extname(filename));
  const thumbFilename = `${uuid}.jpg`;
  await sharp(originalPath)
    .resize(150, 150, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toFile(path.join(thumbDir, thumbFilename));

  return thumbFilename;
}

async function deleteResidentPicture(thumbFilename) {
  if (!thumbFilename) return;
  const uuid = path.basename(thumbFilename, '.jpg');
  fs.unlink(path.join(THUMBNAIL_DIR, 'residents', thumbFilename), () => {});
  for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']) {
    fs.unlink(path.join(UPLOAD_DIR, 'residents', uuid + ext), () => {});
  }
}

// ─── Post attachments ─────────────────────────────────────────────────────────

/**
 * Maximum per-file size for post attachments.
 * Reads MAX_UPLOAD_SIZE_MB from env at startup (not per-request) — restart
 * required to pick up env changes.
 */
const MAX_ATTACHMENT_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB) || 90;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

/**
 * MIME type block-list for post attachments.
 *
 * We use a block-list rather than an allow-list because post attachments are
 * intentionally broad (PDFs, office docs, archives, images, audio, video).
 * The blocked types are those that could be executed by a browser or OS:
 *   - HTML/XHTML: could be served as a page and execute scripts (XSS via file download)
 *   - JavaScript: obvious script execution risk
 *   - Shell scripts: OS execution risk
 *   - Windows executables: direct execution risk
 *
 * Files stored with UUID names + sanitised extensions — no file has an
 * executable name regardless of MIME. This block-list is belt-and-suspenders.
 */
const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/x-sh',
  'text/x-sh',
  'application/x-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-bat',
  'application/x-dosexec',
]);

function attachmentFileFilter(_req, file, cb) {
  if (BLOCKED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`Dateityp nicht erlaubt: ${file.mimetype}`));
  } else {
    cb(null, true);
  }
}

const attachmentStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    const dir = path.join(UPLOAD_DIR, 'posts');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const uuid = crypto.randomUUID();
    // Sanitise extension: alphanumeric + dot only, max 6 chars, default .bin
    const raw = path.extname(file.originalname).toLowerCase();
    const ext = raw.replace(/[^a-z0-9.]/g, '').slice(0, 7) || '.bin';
    cb(null, uuid + ext);
  },
});

/**
 * Multer instance for post attachments.
 * Usage in route: uploadAttachments.array('attachments', MAX_FILES)(req, res, cb)
 */
const uploadAttachments = multer({
  storage: attachmentStorage,
  fileFilter: attachmentFileFilter,
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
});

/**
 * Generate a 400×300 JPEG thumbnail for an image post attachment.
 *
 * @param {string} absolutePath - Full path to the uploaded original.
 * @param {string} storedName   - Stored filename (UUID-based, used to derive thumb name).
 * @returns {Promise<void>}     - Writes thumb to THUMBNAIL_DIR/posts/UUID.jpg.
 */
async function createPostThumbnail(absolutePath, storedName) {
  const thumbDir = path.join(THUMBNAIL_DIR, 'posts');
  await fs.promises.mkdir(thumbDir, { recursive: true });

  const uuid = path.basename(storedName, path.extname(storedName));
  await sharp(absolutePath)
    .resize(400, 300, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80 })
    .toFile(path.join(thumbDir, `${uuid}.jpg`));
}

/**
 * Derive the public thumbnail URL from stored_path.
 * stored_path is relative to UPLOAD_DIR: "posts/UUID.ext"
 * Thumbnail: /thumbs/posts/UUID.jpg
 */
function postThumbUrl(storedPath) {
  const uuid = path.basename(storedPath, path.extname(storedPath));
  return `/thumbs/posts/${uuid}.jpg`;
}

/**
 * Best-effort deletion of an attachment's original + thumbnail.
 *
 * @param {string} storedPath   - Relative path stored in DB (e.g. "posts/UUID.pdf").
 * @param {boolean} isImage     - Whether to also delete the thumbnail.
 */
function deleteAttachmentFiles(storedPath, isImage) {
  if (!storedPath) return;
  fs.unlink(path.join(UPLOAD_DIR, storedPath), () => {});
  if (isImage) {
    const uuid = path.basename(storedPath, path.extname(storedPath));
    fs.unlink(path.join(THUMBNAIL_DIR, 'posts', `${uuid}.jpg`), () => {});
  }
}

module.exports = {
  uploadPicture,
  createResidentThumbnail,
  deleteResidentPicture,
  uploadAttachments,
  MAX_ATTACHMENT_MB,
  createPostThumbnail,
  postThumbUrl,
  deleteAttachmentFiles,
};
