module.exports = function createPostRepo(db) {
  function baseQuery() {
    return (
      db('posts')
        .join('users', 'posts.author_user_id', 'users.id')
        // LEFT JOIN: author may not have an address (e.g. admin accounts)
        .leftJoin('addresses', 'users.address_id', 'addresses.id')
        .select(
          'posts.*',
          'users.username as author_username',
          'addresses.id as author_address_id',
          'addresses.display_name as author_address_name'
        )
    );
  }

  return {
    async findAll({ limit = 20, offset = 0 } = {}) {
      const [rows, countRow] = await Promise.all([
        baseQuery()
          .orderBy('posts.created_at', 'desc')
          .orderBy('posts.id', 'desc')
          .limit(limit)
          .offset(offset),
        db('posts').count('id as count').first(),
      ]);
      return { rows, total: countRow.count };
    },

    findById(id) {
      return baseQuery().where('posts.id', id).first();
    },

    async create(data) {
      const [id] = await db('posts').insert(data);
      return baseQuery().where('posts.id', id).first();
    },

    async update(id, data) {
      await db('posts')
        .where({ id })
        .update({ ...data, updated_at: db.fn.now() });
      return baseQuery().where('posts.id', id).first();
    },

    delete(id) {
      return db('posts').where({ id }).delete();
    },

    findByAuthorId(userId) {
      return baseQuery().where('posts.author_user_id', userId).orderBy('posts.created_at', 'desc');
    },
  };
};
