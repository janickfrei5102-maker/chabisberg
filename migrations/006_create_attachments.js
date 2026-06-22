exports.up = function (knex) {
  return knex.schema.createTable('attachments', function (table) {
    table.increments('id').primary();
    table.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    table.string('filename').notNullable();
    table.string('stored_path').notNullable();
    table.string('mime_type').notNullable();
    // Use bigInteger for files up to 90 MB
    table.bigInteger('size_bytes').notNullable();
    table.boolean('is_image').notNullable().defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable('attachments');
};
