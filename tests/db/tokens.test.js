const { createTestDb } = require('./helpers');
const createAddressRepo = require('../../src/db/addresses');
const createUserRepo = require('../../src/db/users');
const createTokenRepo = require('../../src/db/tokens');

let db, cleanup, repo, userId;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb('tokens'));
  repo = createTokenRepo(db);
  const addressRepo = createAddressRepo(db);
  const userRepo = createUserRepo(db);

  const addr = await addressRepo.create({
    street: 'T',
    house_number: '1',
    postal_code: '8000',
    city: 'Zürich',
    display_name: 'T',
  });
  const user = await userRepo.create({
    username: 'tokentestuser',
    password_hash: 'fakehash',
    address_id: addr.id,
    role: 'resident',
  });
  userId = user.id;
});

afterAll(() => cleanup());
afterEach(() => db('tokens').delete());

describe('tokens repo', () => {
  it('create generates a 6-char uppercase hex token', async () => {
    const t = await repo.create();
    expect(t.token).toMatch(/^[0-9A-F]{6}$/);
    expect(t.used).toBe(0);
  });

  it('each create generates a unique token', async () => {
    const t1 = await repo.create();
    const t2 = await repo.create();
    expect(t1.token).not.toBe(t2.token);
  });

  it('findByToken returns correct token', async () => {
    const t = await repo.create();
    const found = await repo.findByToken(t.token);
    expect(found.id).toBe(t.id);
  });

  it('findByToken returns undefined for unknown token', async () => {
    const found = await repo.findByToken('ZZZZZZ');
    expect(found).toBeUndefined();
  });

  it('markUsed sets used=true and used_by_user_id', async () => {
    const t = await repo.create();
    const updated = await repo.markUsed(t.id, userId);
    expect(updated.used).toBe(1);
    expect(updated.used_by_user_id).toBe(userId);
  });

  it('findUnused excludes used tokens', async () => {
    const t1 = await repo.create();
    const t2 = await repo.create();
    await repo.markUsed(t1.id, userId);

    const unused = await repo.findUnused();
    const ids = unused.map((t) => t.id);
    expect(ids).not.toContain(t1.id);
    expect(ids).toContain(t2.id);
  });

  it('findAll returns all tokens', async () => {
    await repo.create();
    await repo.create();
    const all = await repo.findAll();
    expect(all.length).toBe(2);
  });
});
