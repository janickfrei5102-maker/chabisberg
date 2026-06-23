module.exports = function createCommentRepo(db) {
  function baseQuery() {
    return db('comments')
      .join('users', 'comments.author_user_id', 'users.id')
      .select(
        'comments.id',
        'comments.post_id',
        'comments.author_user_id',
        'comments.body',
        'comments.created_at',
        'users.username as author_username',
        'users.display_name as author_display_name'
      )
      .orderBy('comments.created_at', 'asc');
  }

  return {
    findByPostId(postId) {
      return baseQuery().where('comments.post_id', postId);
    },

    findByPostIds(postIds) {
      if (!postIds.length) return Promise.resolve([]);
      return baseQuery().whereIn('comments.post_id', postIds);
    },

    async create(data) {
      const [id] = await db('comments').insert(data);
      return baseQuery().where('comments.id', id).first();
    },

    findById(id) {
      return db('comments').where({ id }).first();
    },

    delete(id) {
      return db('comments').where({ id }).delete();
    },

    deleteByPostId(postId) {
      return db('comments').where({ post_id: postId }).delete();
    },
  };
};
