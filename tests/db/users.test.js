const { createTestDb } = require('./helpers');
const createAddressRepo = require('../../src/db/addresses');
const createUserRepo = require('../../src/db/users');

let db, cleanup, clearAll, repo, addressRepo, addressId;

const ADDRESS = {
  street: 'Testgasse',
  house_number: '1',
  postal_code: '8000',
  city: 'Zürich',
  display_name: 'Test',
  lat: 47.37,
  lng: 8.54,
};

const USER = {
  username: 'testuser',
  password_hash: '$2b$12$fakehash',
  role: 'resident',
};

beforeAll(async () => {
  ({ db, cleanup, clearAll } = await createTestDb('users'));
  repo = createUserRepo(db);
  addressRepo = createAddressRepo(db);
});

afterAll(() => cleanup());

beforeEach(async () => {
  await clearAll();
  const addr = await addressRepo.create(ADDRESS);
  addressId = addr.id;
});

describe('users repo', () => {
  it('creates user and retrieves by id', async () => {
    const user = await repo.create({ ...USER, address_id: addressId });
    expect(user.id).toBeDefined();
    expect(user.username).toBe('testuser');
    expect(user.role).toBe('resident');
  });

  it('findByUsername returns correct user', async () => {
    await repo.create({ ...USER, address_id: addressId });
    const found = await repo.findByUsername('testuser');
    expect(found).toBeDefined();
    expect(found.username).toBe('testuser');
  });

  it('findByUsername returns undefined for unknown user', async () => {
    const found = await repo.findByUsername('ghost');
    expect(found).toBeUndefined();
  });

  it('findByAddressId returns all users for address', async () => {
    await repo.create({ ...USER, address_id: addressId });
    await repo.create({ ...USER, username: 'user2', address_id: addressId });

    const users = await repo.findByAddressId(addressId);
    expect(users).toHaveLength(2);
    // SAFE_COLS — password_hash must not be in result
    expect(users[0].password_hash).toBeUndefined();
  });

  it('update changes role', async () => {
    const user = await repo.create({ ...USER, address_id: addressId });
    const updated = await repo.update(user.id, { role: 'admin' });
    expect(updated.role).toBe('admin');
  });

  it('delete removes user', async () => {
    const user = await repo.create({ ...USER, address_id: addressId });
    await repo.delete(user.id);
    const found = await repo.findById(user.id);
    expect(found).toBeUndefined();
  });

  it('username unique constraint throws on duplicate', async () => {
    await repo.create({ ...USER, address_id: addressId });
    let threw = false;
    try {
      await repo.create({ ...USER, address_id: addressId });
    } catch (_e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
