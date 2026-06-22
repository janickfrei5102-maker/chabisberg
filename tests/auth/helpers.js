/**
 * Helpers for auth integration tests.
 *
 * Auth tests use the app's singleton DB (src/db/index.js via src/db/repos.js)
 * which reads DATABASE_PATH from env — set to .test.sqlite by tests/setup.js.
 * This helper connects to the same file for test data setup.
 */

const path = require('path');
const knex = require('knex');
const bcrypt = require('bcrypt');

/** Low cost rounds for test speed — never use 4 in production */
const TEST_BCRYPT_ROUNDS = 4;

function getTestDb() {
  return knex({
    client: 'better-sqlite3',
    connection: { filename: process.env.DATABASE_PATH || './.test.sqlite' },
    useNullAsDefault: true,
  });
}

async function runMigrations(db) {
  await db.migrate.latest({ directory: path.join(__dirname, '../../migrations') });
}

/** Delete all rows in reverse FK order for clean test isolation */
async function clearAll(db) {
  await db('attachments').delete();
  await db('posts').delete();
  await db('tokens').delete();
  await db('residents').delete();
  await db('users').delete();
  await db('addresses').delete();
}

async function createAddress(db, overrides = {}) {
  const data = {
    street: 'Teststr',
    house_number: '1',
    postal_code: '8000',
    city: 'Zürich',
    display_name: 'Test-Adresse',
    lat: 47.37,
    lng: 8.54,
    ...overrides,
  };
  const [id] = await db('addresses').insert(data);
  return db('addresses').where({ id }).first();
}

async function createUser(
  db,
  { username, password = 'testpass1234', address_id = null, role = 'resident' }
) {
  const hash = await bcrypt.hash(password, TEST_BCRYPT_ROUNDS);
  const [id] = await db('users').insert({ username, password_hash: hash, address_id, role });
  return db('users').where({ id }).first();
}

async function createToken(db, tokenValue) {
  const token = tokenValue || Math.random().toString(36).slice(2, 8).toUpperCase();
  const [id] = await db('tokens').insert({ token });
  return db('tokens').where({ id }).first();
}

/**
 * Logs in via POST /auth/login using a supertest agent.
 * Returns the agent (with session cookie persisted) for subsequent requests.
 */
async function loginAs(agent, username, password = 'testpass1234') {
  await agent.post('/auth/login').send({ username, password }).expect(302);
  return agent;
}

module.exports = {
  getTestDb,
  runMigrations,
  clearAll,
  createAddress,
  createUser,
  createToken,
  loginAs,
};
