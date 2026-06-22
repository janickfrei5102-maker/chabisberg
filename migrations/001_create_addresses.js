exports.up = function (knex) {
  return knex.schema.createTable('addresses', function (table) {
    table.increments('id').primary();
    table.string('street').notNullable();
    table.string('house_number').notNullable();
    table.string('postal_code').notNullable();
    table.string('city').notNullable();
    table.float('lat');
    table.float('lng');
    table.string('display_name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('addresses');
};
