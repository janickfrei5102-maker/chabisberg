/**
 * Auth route integration tests — login, register, logout.
 *
 * These tests run against the real Express app with a real SQLite DB,
 * not against mocks. This ensures the full stack (middleware → route → DB)
 * is exercised, which is the only way to catch authorization bypasses.
 */

const request = require('supertest');
const app = require('../../src/app');
const {
  getTestDb,
  runMigrations,
  clearAll,
  createAddress,
  createUser,
  createToken,
} = require('./helpers');

let db;

beforeAll(async () => {
  db = getTestDb();
  await runMigrations(db);
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await clearAll(db);
});

// ─── Login ────────────────────────────────────────────────────────────────────

describe('GET /auth/login', () => {
  it('returns 200 and login form', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Anmelden');
    expect(res.text).toContain('_csrf');
  });

  it('redirects to / if already logged in', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'u1', address_id: addr.id });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ username: 'u1', password: 'testpass1234' });
    const res = await agent.get('/auth/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('POST /auth/login', () => {
  it('redirects to / on valid credentials', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'validuser', address_id: addr.id });

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'validuser', password: 'testpass1234' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('returns 401 on wrong password', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'user2', address_id: addr.id });

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'user2', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.text).toContain('Ungültige Anmeldedaten');
  });

  it('returns 401 on unknown username (generic error — no enumeration)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'nobody', password: 'password' });

    expect(res.status).toBe(401);
    // Must be same error message as wrong-password case
    expect(res.text).toContain('Ungültige Anmeldedaten');
  });

  it('sets session cookie on successful login', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'cookieuser', address_id: addr.id });

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'cookieuser', password: 'testpass1234' });

    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('maintains session across requests', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'sessionuser', address_id: addr.id });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ username: 'sessionuser', password: 'testpass1234' });

    const res = await agent.get('/');
    // Authenticated users see the home page (200), not a redirect to login
    expect(res.status).toBe(200);
  });

  it('redirects to custom redirect param on login', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'rediruser', address_id: addr.id });

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'rediruser', password: 'testpass1234', redirect: '/admin' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  it('ignores redirect param pointing outside app (open redirect prevention)', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'openredir', address_id: addr.id });

    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'openredir', password: 'testpass1234', redirect: 'https://evil.com' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

// ─── Register ─────────────────────────────────────────────────────────────────

describe('GET /auth/register', () => {
  it('returns 200 with address dropdown', async () => {
    await createAddress(db, { display_name: 'Testhaus' });
    const res = await request(app).get('/auth/register');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Testhaus');
    expect(res.text).toContain('_csrf');
  });
});

describe('POST /auth/register', () => {
  it('creates user and logs in with valid token + address', async () => {
    const addr = await createAddress(db);
    const tok = await createToken(db, 'AABBCC');

    const agent = request.agent(app);
    const res = await agent.post('/auth/register').send({
      token: 'AABBCC',
      username: 'newresident',
      display_name: 'New Resident',
      password: 'securepass1',
      passwordConfirm: 'securepass1',
      address_id: addr.id,
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');

    // Token should now be marked used
    const updated = await db('tokens').where({ id: tok.id }).first();
    expect(updated.used).toBe(1);
    expect(updated.used_by_user_id).toBeDefined();

    // Session should be active — GET / returns 200
    const home = await agent.get('/');
    expect(home.status).toBe(200);
  });

  it('rejects invalid token', async () => {
    const addr = await createAddress(db);
    const res = await request(app).post('/auth/register').send({
      token: 'ZZZZZZ',
      username: 'attacker',
      display_name: 'Attacker',
      password: 'password123',
      passwordConfirm: 'password123',
      address_id: addr.id,
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Ungültiger oder bereits verwendeter Token');
  });

  it('rejects already-used token', async () => {
    const addr = await createAddress(db);
    const tok = await createToken(db, 'USEDXX');
    // Mark used
    await db('tokens').where({ id: tok.id }).update({ used: true });

    const res = await request(app).post('/auth/register').send({
      token: 'USEDXX',
      username: 'latecomer',
      display_name: 'Late Comer',
      password: 'password123',
      passwordConfirm: 'password123',
      address_id: addr.id,
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('Ungültiger oder bereits verwendeter Token');
  });

  it('rejects mismatching passwords', async () => {
    const addr = await createAddress(db);
    await createToken(db, 'MMATCH');

    const res = await request(app).post('/auth/register').send({
      token: 'MMATCH',
      username: 'mismatch',
      display_name: 'Mismatch User',
      password: 'password123',
      passwordConfirm: 'different123',
      address_id: addr.id,
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('stimmen nicht überein');
  });

  it('rejects password shorter than 8 chars', async () => {
    const addr = await createAddress(db);
    await createToken(db, 'SHRTPW');

    const res = await request(app).post('/auth/register').send({
      token: 'SHRTPW',
      username: 'shortpass',
      display_name: 'Short Pass',
      password: 'abc',
      passwordConfirm: 'abc',
      address_id: addr.id,
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('mindestens 8 Zeichen');
  });

  it('rejects duplicate username', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'taken', address_id: addr.id });
    await createToken(db, 'DUPTOK');

    const res = await request(app).post('/auth/register').send({
      token: 'DUPTOK',
      username: 'taken',
      display_name: 'Taken User',
      password: 'password123',
      passwordConfirm: 'password123',
      address_id: addr.id,
    });
    expect(res.status).toBe(400);
    expect(res.text).toContain('bereits vergeben');
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('destroys session and redirects to login', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'logoutuser', address_id: addr.id });

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ username: 'logoutuser', password: 'testpass1234' });

    // Verify logged in
    expect((await agent.get('/')).status).toBe(200);

    // Logout
    const res = await agent.post('/auth/logout');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/login');

    // Verify session is gone — / now redirects to login
    const after = await agent.get('/');
    expect(after.status).toBe(302);
    expect(after.headers.location).toContain('/auth/login');
  });
});
