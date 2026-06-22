const bcrypt = require('bcrypt');
const crypto = require('crypto');

exports.seed = async function (knex) {
  // Idempotent: skip if demo data exists
  const existing = await knex('addresses').where({ street: 'Bergstrasse' }).first();
  if (existing) return;

  // --- Addresses ---
  const [addr1] = await knex('addresses').insert({
    street: 'Bergstrasse',
    house_number: '12',
    postal_code: '8001',
    city: 'Zürich',
    display_name: 'Familie Müller',
    lat: 47.3782,
    lng: 8.543,
  });

  const [addr2] = await knex('addresses').insert({
    street: 'Seestrasse',
    house_number: '47',
    postal_code: '8002',
    city: 'Zürich',
    display_name: 'Familie Schmid',
    lat: 47.3651,
    lng: 8.5392,
  });

  const [addr3] = await knex('addresses').insert({
    street: 'Dorfgasse',
    house_number: '3',
    postal_code: '8001',
    city: 'Zürich',
    display_name: 'Meier / Keller',
    lat: 47.371,
    lng: 8.548,
  });

  // --- Residents ---
  await knex('residents').insert([
    {
      address_id: addr1,
      display_name: 'Markus Müller',
      type: 'Erwachsener',
      claim: 'Schreiner, repariert gerne',
      birthday: '1978-04-15',
      showbirthday: true,
    },
    {
      address_id: addr1,
      display_name: 'Sandra Müller',
      type: 'Erwachsener',
      claim: 'Lehrerin',
      birthday: '1981-09-22',
      showbirthday: true,
    },
    {
      address_id: addr1,
      display_name: 'Luca Müller',
      type: 'Kind',
      birthday: '2012-07-03',
      showbirthday: false,
    },
    {
      address_id: addr1,
      display_name: 'Bello',
      type: 'Hund',
      showbirthday: false,
    },
    {
      address_id: addr2,
      display_name: 'Peter Schmid',
      type: 'Erwachsener',
      claim: 'Architekt',
      birthday: '1965-12-01',
      showbirthday: true,
    },
    {
      address_id: addr2,
      display_name: 'Nina Schmid',
      type: 'Erwachsener',
      birthday: '1970-03-17',
      showbirthday: true,
    },
    {
      address_id: addr3,
      display_name: 'Thomas Meier',
      type: 'Erwachsener',
      claim: 'Programmierer',
      birthday: '1990-06-30',
      showbirthday: true,
    },
    {
      address_id: addr3,
      display_name: 'Anna Keller',
      type: 'Erwachsener',
      claim: 'Ärztin',
      birthday: '1988-11-14',
      showbirthday: true,
    },
    {
      address_id: addr3,
      display_name: 'Mimi',
      type: 'Katze',
      showbirthday: false,
    },
  ]);

  // --- Demo resident user ---
  const hash = await bcrypt.hash('demo1234', 10);
  await knex('users').insert({
    username: 'mueller',
    password_hash: hash,
    address_id: addr1,
    role: 'resident',
  });

  // --- Registration tokens ---
  const tokens = Array.from({ length: 5 }, () => ({
    token: crypto.randomBytes(3).toString('hex').toUpperCase(),
  }));
  await knex('tokens').insert(tokens);

  // --- Demo post ---
  const adminUser = await knex('users').where({ role: 'admin' }).first();
  if (adminUser) {
    const [postId] = await knex('posts').insert({
      author_user_id: adminUser.id,
      title: 'Willkommen im Chabisberg!',
      body: '<p>Herzlich willkommen auf der Quartier-Plattform. Hier findet ihr Neuigkeiten, Karte und Kontakte eurer Nachbarinnen und Nachbarn.</p>',
    });

    await knex('posts').insert({
      author_user_id: adminUser.id,
      title: 'Quartierputz am Samstag',
      body: '<p>Diesen Samstag um 9 Uhr treffen wir uns beim Brunnen für den gemeinsamen Quartierputz. Alle sind eingeladen!</p>',
      hyperlink: null,
    });

    void postId; // used for ordering reference only
  }
};
