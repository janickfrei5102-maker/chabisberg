/**
 * News-Stream integration tests.
 *
 * Invariants verified:
 *   1. GET / → 200 with news section for authenticated users.
 *   2. GET / → 302 for guests.
 *   3. POST /posts → creates post (text-only), redirects (authenticated).
 *   4. POST /posts → 302 to login for guests.
 *   5. POST /posts with empty body → 400.
 *   6. DELETE own post → 302 (success).
 *   7. DELETE foreign post as resident → 403 (blocked).
 *   8. DELETE any post as admin → 302 (allowed).
 */

const request = require('supertest');
const app = require('../../src/app');
const {
  getTestDb,
  runMigrations,
  clearAll,
  createAddress,
  createUser,
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

async function loginAs(username, password = 'testpass1234') {
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ username, password }).expect(302);
  return agent;
}

async function createPost(db, userId, overrides = {}) {
  const [id] = await db('posts').insert({
    author_user_id: userId,
    body: 'Testinhalt',
    title: null,
    hyperlink: null,
    ...overrides,
  });
  return db('posts').where({ id }).first();
}

// ─── Homepage / news section ──────────────────────────────────────────────────

describe('GET / (news stream)', () => {
  it('redirects guest', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
  });

  it('shows news section for authenticated user', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'newsUser', address_id: addr.id });
    const agent = await loginAs('newsUser');
    const res = await agent.get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('News');
    expect(res.text).toContain('Beitrag schreiben');
  });

  it('shows existing posts', async () => {
    const addr = await createAddress(db);
    const user = await createUser(db, { username: 'poster1', address_id: addr.id });
    await createPost(db, user.id, { body: 'Hallo Quartier!' });
    const agent = await loginAs('poster1');
    const res = await agent.get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Hallo Quartier!');
  });
});

// ─── Create post ──────────────────────────────────────────────────────────────

describe('POST /posts', () => {
  it('redirects guest to login', async () => {
    const res = await request(app).post('/posts').send({ body: 'Test' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('creates text-only post and redirects', async () => {
    const addr = await createAddress(db);
    const user = await createUser(db, { username: 'poster2', address_id: addr.id });
    const agent = await loginAs('poster2');

    const res = await agent.post('/posts').send({
      title: 'Quartierfest',
      body: 'Am Samstag ist Quartierfest!',
      hyperlink: 'https://example.com',
    });
    expect(res.status).toBe(302);

    const post = await db('posts').where({ author_user_id: user.id }).first();
    expect(post).toBeDefined();
    expect(post.title).toBe('Quartierfest');
    expect(post.body).toBe('Am Samstag ist Quartierfest!');
    expect(post.hyperlink).toBe('https://example.com');
  });

  it('stores author_user_id from session (never from body)', async () => {
    const addr = await createAddress(db);
    const userA = await createUser(db, { username: 'posterA', address_id: addr.id });
    const userB = await createUser(db, { username: 'posterB', address_id: addr.id });
    const agent = await loginAs('posterA');

    await agent.post('/posts').send({
      body: 'Test Body',
      author_user_id: userB.id, // injection attempt
    });

    const post = await db('posts').where({ body: 'Test Body' }).first();
    expect(post).toBeDefined();
    // Must be userA's id from session, not injected userB.id
    expect(Number(post.author_user_id)).toBe(Number(userA.id));
  });

  it('rejects empty body', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'poster3', address_id: addr.id });
    const agent = await loginAs('poster3');

    const res = await agent.post('/posts').send({ title: 'Nur Titel', body: '' });
    expect(res.status).toBe(400);
  });
});

// ─── Delete post ──────────────────────────────────────────────────────────────

describe('POST /posts/:id/delete', () => {
  it('author can delete own post', async () => {
    const addr = await createAddress(db);
    const user = await createUser(db, { username: 'author1', address_id: addr.id });
    const post = await createPost(db, user.id);
    const agent = await loginAs('author1');

    const res = await agent.post(`/posts/${post.id}/delete`);
    expect(res.status).toBe(302);

    const gone = await db('posts').where({ id: post.id }).first();
    expect(gone).toBeUndefined();
  });

  /**
   * CRITICAL: resident must not be able to delete another user's post.
   */
  it('BLOCKS resident from deleting foreign post', async () => {
    const addr = await createAddress(db);
    const author = await createUser(db, { username: 'author2', address_id: addr.id });
    const other = await createUser(db, { username: 'other1', address_id: addr.id });
    const post = await createPost(db, author.id, { body: 'Zu schützender Post' });

    const agent = await loginAs('other1');
    const res = await agent.post(`/posts/${post.id}/delete`);
    expect(res.status).toBe(403);

    const still = await db('posts').where({ id: post.id }).first();
    expect(still).toBeDefined();
  });

  it('admin can delete any post', async () => {
    const addr = await createAddress(db);
    const author = await createUser(db, { username: 'author3', address_id: addr.id });
    await createUser(db, { username: 'admX', address_id: addr.id, role: 'admin' });
    const post = await createPost(db, author.id);

    const agent = await loginAs('admX');
    const res = await agent.post(`/posts/${post.id}/delete`);
    expect(res.status).toBe(302);

    const gone = await db('posts').where({ id: post.id }).first();
    expect(gone).toBeUndefined();
  });

  it('returns 404 for non-existent post', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'poster4', address_id: addr.id });
    const agent = await loginAs('poster4');
    const res = await agent.post('/posts/99999/delete');
    expect(res.status).toBe(404);
  });
});
