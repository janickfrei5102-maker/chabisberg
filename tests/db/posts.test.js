const { createTestDb } = require('./helpers');
const createAddressRepo = require('../../src/db/addresses');
const createUserRepo = require('../../src/db/users');
const createPostRepo = require('../../src/db/posts');

let db, cleanup, repo, authorId;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb('posts'));
  repo = createPostRepo(db);
  const addressRepo = createAddressRepo(db);
  const userRepo = createUserRepo(db);

  const addr = await addressRepo.create({
    street: 'P',
    house_number: '1',
    postal_code: '8000',
    city: 'Zürich',
    display_name: 'P',
  });
  const user = await userRepo.create({
    username: 'postauthor',
    password_hash: 'fakehash',
    address_id: addr.id,
    role: 'resident',
  });
  authorId = user.id;
});

afterAll(() => cleanup());
afterEach(() => db('posts').delete());

const POST = { title: 'Hello', body: '<p>World</p>' };

describe('posts repo', () => {
  it('creates post with author join', async () => {
    const post = await repo.create({ ...POST, author_user_id: authorId });
    expect(post.id).toBeDefined();
    expect(post.title).toBe('Hello');
    expect(post.author_username).toBe('postauthor');
  });

  it('findById includes author_username', async () => {
    const post = await repo.create({ ...POST, author_user_id: authorId });
    const found = await repo.findById(post.id);
    expect(found.author_username).toBe('postauthor');
  });

  it('findAll returns newest first', async () => {
    await repo.create({ ...POST, title: 'First', author_user_id: authorId });
    await repo.create({ ...POST, title: 'Second', author_user_id: authorId });

    const { rows } = await repo.findAll();
    expect(rows[0].title).toBe('Second');
    expect(rows[1].title).toBe('First');
  });

  it('findAll pagination works', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({ body: `Post ${i}`, author_user_id: authorId });
    }
    const { rows, total } = await repo.findAll({ limit: 2, offset: 0 });
    expect(rows).toHaveLength(2);
    expect(total).toBe(5);
  });

  it('update changes title', async () => {
    const post = await repo.create({ ...POST, author_user_id: authorId });
    const updated = await repo.update(post.id, { title: 'Updated' });
    expect(updated.title).toBe('Updated');
    expect(updated.body).toBe('<p>World</p>');
  });

  it('delete removes post', async () => {
    const post = await repo.create({ ...POST, author_user_id: authorId });
    await repo.delete(post.id);
    expect(await repo.findById(post.id)).toBeUndefined();
  });

  it('findByAuthorId returns only posts for that author', async () => {
    await repo.create({ ...POST, author_user_id: authorId });
    await repo.create({ ...POST, author_user_id: authorId });

    const posts = await repo.findByAuthorId(authorId);
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p.author_user_id === authorId)).toBe(true);
  });
});
