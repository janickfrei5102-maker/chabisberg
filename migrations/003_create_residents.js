exports.up = function (knex) {
  return knex.schema.createTable('residents', function (table) {
    table.increments('id').primary();
    table
      .integer('address_id')
      .notNullable()
      .references('id')
      .inTable('addresses')
      .onDelete('CASCADE');
    table.string('display_name').notNullable();
    table.string('phone');
    table.string('picture');
    table.text('claim');
    // type: 'Erwachsener' | 'Kind' | 'Katze' | 'Hund'
    table.string('type').notNullable().defaultTo('Erwachsener');
    table.date('birthday');
    // Animals always get showbirthday=false — enforced at app layer
    table.boolean('showbirthday').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('residents');
};
