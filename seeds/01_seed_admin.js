const bcrypt = require('bcrypt');

exports.seed = async function (knex) {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const existing = await knex('users').where({ username: adminUsername }).first();
  if (existing) return;

  const [addressId] = await knex('addresses').insert({
    street: 'Musterstrasse',
    house_number: '1',
    postal_code: '8000',
    city: 'Zürich',
    display_name: 'Verwaltung',
    lat: 47.3769,
    lng: 8.5417,
  });

  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'changeme', 12);

  await knex('users').insert({
    username: adminUsername,
    display_name: 'Administrator',
    password_hash: hash,
    address_id: addressId,
    role: 'admin',
  });
};
