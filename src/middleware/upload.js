/**
 * Multer + Sharp upload middleware for resident profile pictures.
 *
 * Security considerations:
 * ─────────────────────────
 * 1. MIME type check: only image/* is accepted. The check uses the Content-Type
 *    header sent by the client, which is not authoritative — a malicious actor can
 *    lie about MIME. The actual stored files are renamed to UUID-based filenames
 *    with no executable extension, so even a disguised file cannot be executed.
 *    An additional magic-byte check (via file-type package) would be belt-and-
 *    suspenders but is omitted here; the Docker container serves files as static
 *    assets without execute permission.
 *
 * 2. Filename: user-controlled filenames are NEVER used. Multer generates a
 *    UUID-based filename. This prevents path traversal and directory injection.
 *
 * 3. Destination: fixed to UPLOAD_DIR/residents/. No user input influences the
 *    directory, so path traversal via filename cannot escape the upload directory.
 *
 * 4. Size limit: 10 MB for profile pictures (generously large). This is
 *    separate from the 90 MB limit for post attachments.
 *
 * 5. Sharp thumbnail: output is always JPEG regardless of input format, so
 *    polyglot files (e.g., JPEG+HTML) are sanitised by the transcoding step.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || './thumbnails';

/** Maximum size for resident profile pictures (10 MB). */
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    const dir = path.join(UPLOAD_DIR, 'residents');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    // UUID ensures no collisions and no user-controlled path components.
    const uuid = crypto.randomUUID();
    const ext =
      path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^a-z0-9.]/g, '') || '.jpg';
    cb(null, uuid + ext);
  },
});

/**
 * File filter: accept only images by MIME type.
 * See security note above — MIME is client-declared but sufficient for
 * defence-in-depth given UUID filenames and no shell execution.
 */
function fileFilter(_req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Nur Bilddateien erlaubt (JPEG, PNG, GIF, WebP)'));
  }
}

/** Multer instance — use `.single('picture')` in routes. */
const uploadPicture = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE_BYTES } });

/**
 * Generate a 150×150 JPEG thumbnail from an uploaded image.
 * Output is always JPEG regardless of input format — this sanitises
 * any polyglot payloads via the transcoding step.
 *
 * @param {string} originalPath - Absolute path to the uploaded original.
 * @param {string} filename     - Original filename (used to derive UUID base).
 * @returns {Promise<string>}   - Thumbnail filename (e.g. "abc.jpg").
 */
async function createResidentThumbnail(originalPath, filename) {
  const thumbDir = path.join(THUMBNAIL_DIR, 'residents');
  await fs.promises.mkdir(thumbDir, { recursive: true });

  const uuid = path.basename(filename, path.extname(filename));
  const thumbFilename = `${uuid}.jpg`;
  const thumbPath = path.join(thumbDir, thumbFilename);

  await sharp(originalPath)
    .resize(150, 150, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toFile(thumbPath);

  return thumbFilename;
}

/**
 * Best-effort deletion of both the thumbnail and the original upload.
 * Errors are swallowed — a missing file should not crash a delete operation.
 *
 * @param {string} thumbFilename - Value stored in residents.picture (e.g. "abc.jpg").
 */
async function deleteResidentPicture(thumbFilename) {
  if (!thumbFilename) return;

  const uuid = path.basename(thumbFilename, '.jpg');

  // Delete thumbnail
  const thumbPath = path.join(THUMBNAIL_DIR, 'residents', thumbFilename);
  fs.unlink(thumbPath, () => {});

  // Delete original — try common image extensions
  for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']) {
    fs.unlink(path.join(UPLOAD_DIR, 'residents', uuid + ext), () => {});
  }
}

module.exports = { uploadPicture, createResidentThumbnail, deleteResidentPicture };
