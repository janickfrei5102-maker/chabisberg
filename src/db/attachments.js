module.exports = function createAttachmentRepo(db) {
  return {
    findByPostId(postId) {
      return db('attachments').where({ post_id: postId }).select('*').orderBy('created_at');
    },

    findImages(postId) {
      return db('attachments')
        .where({ post_id: postId, is_image: true })
        .select('*')
        .orderBy('created_at');
    },

    findById(id) {
      return db('attachments').where({ id }).first();
    },

    async create(data) {
      const [id] = await db('attachments').insert(data);
      return db('attachments').where({ id }).first();
    },

    delete(id) {
      return db('attachments').where({ id }).delete();
    },

    deleteByPostId(postId) {
      return db('attachments').where({ post_id: postId }).delete();
    },

    async getTotalSize() {
      const row = await db('attachments').sum('size_bytes as total').first();
      return Number(row.total) || 0;
    },

    async getStorageStats() {
      const row = await db('attachments')
        .count('id as count')
        .sum('size_bytes as total_bytes')
        .first();
      return { count: Number(row.count) || 0, total_bytes: Number(row.total_bytes) || 0 };
    },
  };
};
