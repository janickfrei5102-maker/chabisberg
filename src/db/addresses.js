module.exports = function createAddressRepo(db) {
  return {
    findAll() {
      return db('addresses').select('*').orderBy('display_name');
    },

    findById(id) {
      return db('addresses').where({ id }).first();
    },

    /**
     * Returns all addresses that have coordinates, with their residents nested.
     * Used by the map API endpoint — two queries + JS join to avoid SQLite JSON limitations.
     */
    async findAllForMap() {
      const addresses = await db('addresses')
        .select('*')
        .whereNotNull('lat')
        .whereNotNull('lng')
        .orderBy('display_name');

      const residents = await db('residents')
        .select('id', 'address_id', 'display_name', 'claim', 'picture', 'type')
        .orderBy('display_name');

      const byAddress = {};
      for (const r of residents) {
        if (!byAddress[r.address_id]) byAddress[r.address_id] = [];
        byAddress[r.address_id].push(r);
      }

      return addresses.map((a) => ({ ...a, residents: byAddress[a.id] || [] }));
    },

    async create(data) {
      const [id] = await db('addresses').insert(data);
      return db('addresses').where({ id }).first();
    },

    async update(id, data) {
      await db('addresses')
        .where({ id })
        .update({ ...data, updated_at: db.fn.now() });
      return db('addresses').where({ id }).first();
    },

    delete(id) {
      return db('addresses').where({ id }).delete();
    },
  };
};
