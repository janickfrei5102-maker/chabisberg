const bcrypt = require('bcrypt');
const crypto = require('crypto');

const ADDRESSES = [
  { display_name: 'Bezirksweg 4',       street: 'Bezirksweg',      house_number: '4',   lng: 8.2189285, lat: 47.5091082, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Reinerstrasse 145',  street: 'Reinerstrasse',   house_number: '145', lng: 8.2218835, lat: 47.5080894, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 1',     street: 'Sandacherweg',    house_number: '1',   lng: 8.219366,  lat: 47.5086182, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 2',     street: 'Sandacherweg',    house_number: '2',   lng: 8.2197849, lat: 47.5085098, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 3',     street: 'Sandacherweg',    house_number: '3',   lng: 8.2194142, lat: 47.5089289, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 4',     street: 'Sandacherweg',    house_number: '4',   lng: 8.2198403, lat: 47.5087261, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 6',     street: 'Sandacherweg',    house_number: '6',   lng: 8.2198634, lat: 47.5089854, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 8',     street: 'Sandacherweg',    house_number: '8',   lng: 8.2198932, lat: 47.5092078, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 10',    street: 'Sandacherweg',    house_number: '10',  lng: 8.219773,  lat: 47.5096436, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 11',    street: 'Sandacherweg',    house_number: '11',  lng: 8.219271,  lat: 47.5098593, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 12',    street: 'Sandacherweg',    house_number: '12',  lng: 8.219832,  lat: 47.509736,  postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 13',    street: 'Sandacherweg',    house_number: '13',  lng: 8.2192989, lat: 47.5100177, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 14',    street: 'Sandacherweg',    house_number: '14',  lng: 8.2197878, lat: 47.5098684, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 15',    street: 'Sandacherweg',    house_number: '15',  lng: 8.2194777, lat: 47.5101573, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 16',    street: 'Sandacherweg',    house_number: '16',  lng: 8.2199114, lat: 47.509956,  postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 17',    street: 'Sandacherweg',    house_number: '17',  lng: 8.2195072, lat: 47.5103129, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 18',    street: 'Sandacherweg',    house_number: '18',  lng: 8.2198775, lat: 47.5101455, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 19',    street: 'Sandacherweg',    house_number: '19',  lng: 8.2195549, lat: 47.5104503, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 20',    street: 'Sandacherweg',    house_number: '20',  lng: 8.2199809, lat: 47.5104251, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 21',    street: 'Sandacherweg',    house_number: '21',  lng: 8.2196845, lat: 47.5106645, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 22',    street: 'Sandacherweg',    house_number: '22',  lng: 8.2202748, lat: 47.5103323, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 23',    street: 'Sandacherweg',    house_number: '23',  lng: 8.2196201, lat: 47.5106808, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Sandacherweg 24',    street: 'Sandacherweg',    house_number: '24',  lng: 8.2202255, lat: 47.5100956, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Schüracherweg 2',    street: 'Schüracherweg',   house_number: '2',   lng: 8.2198652, lat: 47.509416,  postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Schüracherweg 3',    street: 'Schüracherweg',   house_number: '3',   lng: 8.2201562, lat: 47.5097929, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Schüracherweg 4',    street: 'Schüracherweg',   house_number: '4',   lng: 8.2202161, lat: 47.5093176, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Schüracherweg 6',    street: 'Schüracherweg',   house_number: '6',   lng: 8.2201809, lat: 47.5090399, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Schüracherweg 8',    street: 'Schüracherweg',   house_number: '8',   lng: 8.2201449, lat: 47.5087588, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Töniweg 2',          street: 'Töniweg',         house_number: '2',   lng: 8.2194278, lat: 47.5096835, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Töniweg 5',          street: 'Töniweg',         house_number: '5',   lng: 8.2189021, lat: 47.5093994, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Vorhardstrasse 3',   street: 'Vorhardstrasse',  house_number: '3',   lng: 8.2219724, lat: 47.5083291, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Vorhardstrasse 5',   street: 'Vorhardstrasse',  house_number: '5',   lng: 8.2213173, lat: 47.5116402, postal_code: '5235', city: 'Rüfenach' },
  { display_name: 'Vorhardstrasse 3a',  street: 'Vorhardstrasse',  house_number: '3a',  lng: 8.2219349, lat: 47.5083717, postal_code: '5235', city: 'Rüfenach' },
];

exports.seed = async function (knex) {
  // Idempotent: skip if real addresses already seeded
  const existing = await knex('addresses').where({ street: 'Sandacherweg', house_number: '23' }).first();
  if (existing) return;

  // --- Addresses (insert one by one — SQLite batch insert returns only last id) ---
  const addrMap = {};
  for (const a of ADDRESSES) {
    const [id] = await knex('addresses').insert(a);
    addrMap[`${a.street} ${a.house_number}`] = id;
  }

  const addr23 = addrMap['Sandacherweg 23'];

  // --- Residents at Sandacherweg 23 ---
  await knex('residents').insert([
    {
      address_id: addr23,
      display_name: 'Janick Frei',
      type: 'Erwachsener',
      claim: 'App Admin',
      phone: '079 272 41 22',
      birthday: '1991-04-14',
      showbirthday: true,
    },
    {
      address_id: addr23,
      display_name: 'Jacqueline',
      type: 'Katze',
      showbirthday: false,
    },
  ]);

  // --- Registration tokens ---
  const tokens = Array.from({ length: 5 }, () => ({
    token: crypto.randomBytes(3).toString('hex').toUpperCase(),
  }));
  await knex('tokens').insert(tokens);

  // --- Demo posts ---
  const adminUser = await knex('users').where({ role: 'admin' }).first();
  if (adminUser) {
    await knex('posts').insert([
      {
        author_user_id: adminUser.id,
        title: 'Willkommen im Chabisberg!',
        body: '<p>Herzlich willkommen auf der Quartier-Plattform. Hier findet ihr Neuigkeiten, Karte und Kontakte eurer Nachbarinnen und Nachbarn.</p>',
      },
      {
        author_user_id: adminUser.id,
        title: 'Quartierputz am Samstag',
        body: '<p>Diesen Samstag um 9 Uhr treffen wir uns beim Brunnen für den gemeinsamen Quartierputz. Alle sind eingeladen!</p>',
      },
    ]);
  }
};
