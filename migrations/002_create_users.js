exports.up = function (knex) {
  return knex.schema.createTable('users', function (table) {
    table.increments('id').primary();
    table.string('username').notNullable().unique();
    table.string('email').unique();
    table.string('password_hash').notNullable();
    table.integer('address_id').references('id').inTable('addresses').onDelete('SET NULL');
    // role: 'resident' | 'admin'
    table.string('role').notNullable().defaultTo('resident');
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('users');
};
