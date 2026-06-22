exports.up = function (knex) {
  return knex.schema.createTable('tokens', function (table) {
    table.increments('id').primary();
    table.string('token', 10).notNullable().unique();
    table.boolean('used').notNullable().defaultTo(false);
    // Set after registration
    table.integer('used_by_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('tokens');
};
