const crypto = require('crypto');

module.exports = function createTokenRepo(db) {
  return {
    /** Generates a 6-char uppercase hex token (3 random bytes). */
    generateRaw() {
      return crypto.randomBytes(3).toString('hex').toUpperCase();
    },

    async create() {
      const token = crypto.randomBytes(3).toString('hex').toUpperCase();
      const [id] = await db('tokens').insert({ token });
      return db('tokens').where({ id }).first();
    },

    findByToken(token) {
      return db('tokens').where({ token }).first();
    },

    findAll() {
      return db('tokens').select('*').orderBy('created_at', 'desc');
    },

    findUnused() {
      return db('tokens').where({ used: false }).select('*').orderBy('created_at', 'desc');
    },

    async markUsed(id, userId) {
      await db('tokens').where({ id }).update({ used: true, used_by_user_id: userId });
      return db('tokens').where({ id }).first();
    },

    delete(id) {
      return db('tokens').where({ id }).delete();
    },
  };
};
