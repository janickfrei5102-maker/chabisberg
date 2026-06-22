require('dotenv').config();

const base = {
  client: 'better-sqlite3',
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
  useNullAsDefault: true,
};

module.exports = {
  development: {
    ...base,
    connection: { filename: process.env.DATABASE_PATH || './dev.sqlite' },
  },
  test: {
    ...base,
    connection: { filename: process.env.DATABASE_PATH || './.test.sqlite' },
  },
  production: {
    ...base,
    connection: { filename: process.env.DATABASE_PATH },
  },
};
