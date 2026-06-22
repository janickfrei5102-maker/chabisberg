/**
 * News-Stream routes.
 *
 * POST /posts          — create post with optional attachments
 * POST /posts/:id/delete — delete post + files (own post or admin)
 *
 * Authorization:
 *   Creating: any authenticated user (requireAuth).
 *   Deleting: author or admin — enforced server-side on every delete request.
 *   Admins can delete any post (moderation). Residents can only delete their own.
 *   This is checked by comparing req.session.user.id to post.author_user_id.
 */

const express = require('express');
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../middleware/requireAuth');
const {
  uploadAttachments,
  MAX_ATTACHMENT_MB,
  createPostThumbnail,
  deleteAttachmentFiles,
} = require('../middleware/upload');
const { posts, attachments } = require('../db/repos');

const router = express.Router();

const MAX_FILES = 30;

// ─── Create post ──────────────────────────────────────────────────────────────

router.post(
  '/',
  requireAuth,
  // Run multer manually so we can return a clean error on size/type violation
  // instead of letting it bubble up to the generic error handler (which would
  // lose the user's post content).
  (req, res, next) => {
    uploadAttachments.array('attachments', MAX_FILES)(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).render('error', {
          message: `Anhang zu gross. Maximum: ${MAX_ATTACHMENT_MB} MB.`,
          status: 400,
        });
      }
      if (err) return next(err);
      next();
    });
  },
  async (req, res, next) => {
    const uploadedFiles = req.files || [];
    try {
      const { title, body, hyperlink } = req.body;

      if (!body || !body.trim()) {
        // Clean up any uploaded files if post body is empty
        for (const f of uploadedFiles) deleteAttachmentFiles(`posts/${f.filename}`, false);
        return res
          .status(400)
          .render('error', { message: 'Post-Text darf nicht leer sein.', status: 400 });
      }

      const post = await posts.create({
        author_user_id: req.session.user.id,
        title: title?.trim() || null,
        body: body.trim(),
        hyperlink: hyperlink?.trim() || null,
      });

      // Process each uploaded file: create thumbnail for images, insert attachment row
      for (const file of uploadedFiles) {
        const isImage = file.mimetype.startsWith('image/');
        // stored_path is relative to UPLOAD_DIR — survives UPLOAD_DIR reconfiguration
        const storedPath = `posts/${file.filename}`;
        const absolutePath = path.join(process.env.UPLOAD_DIR || './uploads', storedPath);

        if (isImage) {
          // Best-effort thumbnail; failure should not abort the post creation
          await createPostThumbnail(absolutePath, file.filename).catch((err) => {
            console.error('Thumbnail creation failed:', err.message);
          });
        }

        await attachments.create({
          post_id: post.id,
          filename: file.originalname.slice(0, 255), // display-only, never used for file ops
          stored_path: storedPath,
          mime_type: file.mimetype,
          size_bytes: file.size,
          is_image: isImage,
        });
      }

      res.redirect('/#news');
    } catch (err) {
      // Clean up uploaded files on DB error to avoid orphans
      for (const f of uploadedFiles) {
        deleteAttachmentFiles(`posts/${f.filename}`, f.mimetype.startsWith('image/'));
      }
      next(err);
    }
  }
);

// ─── Delete post ──────────────────────────────────────────────────────────────

router.post('/:id/delete', requireAuth, async (req, res, next) => {
  try {
    const post = await posts.findById(req.params.id);
    if (!post)
      return res.status(404).render('error', { message: 'Post nicht gefunden.', status: 404 });

    /**
     * Authorization: only the author or an admin may delete a post.
     *
     * We compare numeric IDs. SQLite returns integers; session stores the id
     * set at login time (also a number). Use Number() to avoid type coercion
     * surprises if either side is a string.
     *
     * Failing this check → 403 (not 404), so the user knows the post exists
     * but they lack permission. Admins cannot be confused about whether a post
     * they're trying to moderate actually exists.
     */
    const isAuthor = Number(post.author_user_id) === Number(req.session.user.id);
    const isAdmin = req.session.user.role === 'admin';
    if (!isAuthor && !isAdmin) {
      return res.status(403).render('error', { message: 'Keine Berechtigung.', status: 403 });
    }

    // Fetch attachments before deleting post (CASCADE would delete DB rows but not files)
    const postAttachments = await attachments.findByPostId(post.id);

    // Delete the post (CASCADE deletes attachment rows)
    await posts.delete(post.id);

    // Delete files after DB delete — if file deletion fails, post is already gone
    // (acceptable: orphaned files are recoverable, undeleted post rows are not)
    for (const a of postAttachments) {
      deleteAttachmentFiles(a.stored_path, a.is_image);
    }

    res.redirect('/#news');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
