exports.up = function (knex) {
  return knex.schema.alterTable('users', function (table) {
    // Default '' so existing rows are valid; app layer requires non-empty.
    table.string('display_name').notNullable().defaultTo('');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', function (table) {
    table.dropColumn('display_name');
  });
};
