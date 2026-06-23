module.exports = function createUserRepo(db) {
  const SAFE_COLS = [
    'id',
    'username',
    'display_name',
    'email',
    'role',
    'address_id',
    'created_at',
    'updated_at',
  ];

  return {
    findById(id) {
      return db('users').where({ id }).first();
    },

    findByUsername(username) {
      return db('users').where({ username }).first();
    },

    findByAddressId(addressId) {
      return db('users').where({ address_id: addressId }).select(SAFE_COLS);
    },

    findAll() {
      return db('users').select(SAFE_COLS).orderBy('username');
    },

    async create(data) {
      const [id] = await db('users').insert(data);
      return db('users').where({ id }).first();
    },

    async update(id, data) {
      await db('users')
        .where({ id })
        .update({ ...data, updated_at: db.fn.now() });
      return db('users').where({ id }).first();
    },

    delete(id) {
      return db('users').where({ id }).delete();
    },
  };
};
