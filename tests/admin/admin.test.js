/**
 * Admin console access-control tests.
 *
 * Three personas tested on every protected route:
 *   1. Guest (no session)     → 302 redirect to /auth/login
 *   2. Resident (role=resident) → 403 Forbidden
 *   3. Admin (role=admin)       → 200 OK (or 302 after POST)
 *
 * These tests do NOT assert page content in detail — that's left to manual
 * testing. The critical invariant is: non-admins MUST be rejected.
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
} = require('../auth/helpers');

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

/** Log in and return a supertest agent with a persistent session. */
async function loginAs(username, password = 'testpass1234') {
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ username, password }).expect(302);
  return agent;
}

// ─── Access control on GET routes ─────────────────────────────────────────────

const GET_ROUTES = [
  '/admin',
  '/admin/addresses',
  '/admin/addresses/new',
  '/admin/users',
  '/admin/users/new',
  '/admin/tokens',
  '/admin/posts',
  '/admin/uploads',
];

describe('Admin GET routes — access control', () => {
  let adminAgent;
  let residentAgent;
  let addr;

  beforeEach(async () => {
    addr = await createAddress(db);
    await createUser(db, { username: 'admin1', role: 'admin', address_id: addr.id });
    await createUser(db, { username: 'resident1', role: 'resident', address_id: addr.id });
    adminAgent = await loginAs('admin1');
    residentAgent = await loginAs('resident1');
  });

  GET_ROUTES.forEach((route) => {
    it(`guest → 302 on ${route}`, async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/auth/login');
    });

    it(`resident → 403 on ${route}`, async () => {
      const res = await residentAgent.get(route);
      expect(res.status).toBe(403);
    });

    it(`admin → 200 on ${route}`, async () => {
      const res = await adminAgent.get(route);
      expect(res.status).toBe(200);
    });
  });
});

// ─── Access control on POST routes ────────────────────────────────────────────

describe('Admin POST routes — access control', () => {
  let adminAgent;
  let residentAgent;
  let addr;

  beforeEach(async () => {
    addr = await createAddress(db);
    await createUser(db, { username: 'admin2', role: 'admin', address_id: addr.id });
    await createUser(db, { username: 'resident2', role: 'resident', address_id: addr.id });
    adminAgent = await loginAs('admin2');
    residentAgent = await loginAs('resident2');
  });

  it('guest cannot POST /admin/tokens', async () => {
    const res = await request(app).post('/admin/tokens');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('resident cannot POST /admin/tokens', async () => {
    const res = await residentAgent.post('/admin/tokens');
    expect(res.status).toBe(403);
  });

  it('admin can POST /admin/tokens → creates token', async () => {
    const res = await adminAgent.post('/admin/tokens');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/tokens?message=Token+generiert');
    const all = await db('tokens').select('*');
    expect(all.length).toBe(1);
  });
});

// ─── Functional smoke tests for admin ─────────────────────────────────────────

describe('Admin address CRUD', () => {
  let adminAgent;

  beforeEach(async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'adminX', role: 'admin', address_id: addr.id });
    adminAgent = await loginAs('adminX');
  });

  it('creates address via POST /admin/addresses', async () => {
    const res = await adminAgent.post('/admin/addresses').send({
      street: 'Hauptstr',
      house_number: '5',
      postal_code: '8001',
      city: 'Zürich',
      display_name: 'Haus Test',
      lat: '47.3769',
      lng: '8.5417',
    });
    expect(res.status).toBe(302);
    const created = await db('addresses').where({ street: 'Hauptstr' }).first();
    expect(created).toBeDefined();
    expect(created.display_name).toBe('Haus Test');
    expect(parseFloat(created.lat)).toBeCloseTo(47.3769);
  });

  it('edits address via POST /admin/addresses/:id', async () => {
    const a = await createAddress(db, { display_name: 'Alt' });
    const res = await adminAgent.post(`/admin/addresses/${a.id}`).send({
      street: 'Neustr',
      house_number: '1',
      postal_code: '8002',
      city: 'Zürich',
      display_name: 'Neu',
      lat: '',
      lng: '',
    });
    expect(res.status).toBe(302);
    const updated = await db('addresses').where({ id: a.id }).first();
    expect(updated.display_name).toBe('Neu');
    expect(updated.street).toBe('Neustr');
  });

  it('deletes address via POST /admin/addresses/:id/delete', async () => {
    const a = await createAddress(db, { display_name: 'ZumLöschen' });
    await adminAgent.post(`/admin/addresses/${a.id}/delete`);
    const gone = await db('addresses').where({ id: a.id }).first();
    expect(gone).toBeUndefined();
  });
});

describe('Admin user management', () => {
  let adminAgent;

  beforeEach(async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'adminY', role: 'admin', address_id: addr.id });
    adminAgent = await loginAs('adminY');
  });

  it('creates user via POST /admin/users', async () => {
    const addr = await createAddress(db, { display_name: 'Ziel' });
    const res = await adminAgent.post('/admin/users').send({
      username: 'newbie',
      password: 'sicherespasswort',
      role: 'resident',
      address_id: addr.id,
    });
    expect(res.status).toBe(302);
    const created = await db('users').where({ username: 'newbie' }).first();
    expect(created).toBeDefined();
    expect(created.role).toBe('resident');
  });

  it('rejects user creation with short password', async () => {
    const res = await adminAgent.post('/admin/users').send({
      username: 'shorty',
      password: 'abc',
      role: 'resident',
    });
    expect(res.status).toBe(400);
  });

  it('prevents deleting last admin', async () => {
    const self = await db('users').where({ username: 'adminY' }).first();
    const res = await adminAgent.post(`/admin/users/${self.id}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('message');
    const still = await db('users').where({ id: self.id }).first();
    expect(still).toBeDefined();
  });
});

describe('Admin token management', () => {
  let adminAgent;

  beforeEach(async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'adminZ', role: 'admin', address_id: addr.id });
    adminAgent = await loginAs('adminZ');
  });

  it('generates token', async () => {
    await adminAgent.post('/admin/tokens').expect(302);
    const all = await db('tokens').select('*');
    expect(all.length).toBe(1);
    expect(all[0].token).toHaveLength(6);
  });

  it('deletes unused token', async () => {
    const tok = await createToken(db, 'DELTOK');
    await adminAgent.post(`/admin/tokens/${tok.id}/delete`);
    const gone = await db('tokens').where({ id: tok.id }).first();
    expect(gone).toBeUndefined();
  });
});

describe('Admin post moderation', () => {
  let adminAgent;

  beforeEach(async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'adminP', role: 'admin', address_id: addr.id });
    adminAgent = await loginAs('adminP');
  });

  it('deletes post and its attachments', async () => {
    const author = await db('users').where({ username: 'adminP' }).first();
    const [postId] = await db('posts').insert({
      author_user_id: author.id,
      title: 'Test Post',
      body: 'Inhalt',
    });
    await db('attachments').insert({
      post_id: postId,
      filename: 'test.jpg',
      stored_path: '/data/uploads/test.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 1024,
      is_image: true,
    });

    const res = await adminAgent.post(`/admin/posts/${postId}/delete`);
    expect(res.status).toBe(302);

    const post = await db('posts').where({ id: postId }).first();
    expect(post).toBeUndefined();
    const atts = await db('attachments').where({ post_id: postId }).select('id');
    expect(atts).toHaveLength(0);
  });
});
