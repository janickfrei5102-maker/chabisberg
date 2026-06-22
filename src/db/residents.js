const ANIMAL_TYPES = ['Katze', 'Hund'];

module.exports = function createResidentRepo(db) {
  return {
    findByAddressId(addressId) {
      return db('residents').where({ address_id: addressId }).select('*').orderBy('display_name');
    },

    findById(id) {
      return db('residents').where({ id }).first();
    },

    findAll() {
      return db('residents').select('*').orderBy('address_id').orderBy('display_name');
    },

    async create(data) {
      // Animals never show birthday — enforce at DB layer regardless of input
      const normalized = { ...data };
      if (ANIMAL_TYPES.includes(normalized.type)) {
        normalized.showbirthday = false;
      }
      const [id] = await db('residents').insert(normalized);
      return db('residents').where({ id }).first();
    },

    async update(id, data) {
      const normalized = { ...data };
      // If type isn't in the update payload, fetch current type from DB
      const effectiveType = normalized.type || (await db('residents').where({ id }).first())?.type;
      if (ANIMAL_TYPES.includes(effectiveType)) {
        normalized.showbirthday = false;
      }
      await db('residents')
        .where({ id })
        .update({ ...normalized, updated_at: db.fn.now() });
      return db('residents').where({ id }).first();
    },

    delete(id) {
      return db('residents').where({ id }).delete();
    },
  };
};
