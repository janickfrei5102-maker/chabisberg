const path = require('path');
const fs = require('fs');
const knex = require('knex');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

/**
 * Creates an isolated SQLite DB for one test suite, runs all migrations, and
 * returns db + helpers. Each suite gets a unique file to allow parallel runs.
 */
async function createTestDb(label = 'test') {
  const dbPath = path.join(__dirname, `../../.test-${label}-${process.pid}-${Date.now()}.sqlite`);

  const db = knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
  });

  await db.migrate.latest({ directory: MIGRATIONS_DIR });

  async function cleanup() {
    await db.destroy();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  }

  // Delete all rows in reverse FK dependency order
  async function clearAll() {
    await db('attachments').delete();
    await db('posts').delete();
    await db('tokens').delete();
    await db('residents').delete();
    await db('users').delete();
    await db('addresses').delete();
  }

  return { db, cleanup, clearAll };
}

module.exports = { createTestDb };
