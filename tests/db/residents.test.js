const { createTestDb } = require('./helpers');
const createAddressRepo = require('../../src/db/addresses');
const createResidentRepo = require('../../src/db/residents');

let db, cleanup, clearAll, repo, addressRepo, addressId;

beforeAll(async () => {
  ({ db, cleanup, clearAll } = await createTestDb('residents'));
  repo = createResidentRepo(db);
  addressRepo = createAddressRepo(db);
});

afterAll(() => cleanup());

beforeEach(async () => {
  await clearAll();
  const addr = await addressRepo.create({
    street: 'Teststr',
    house_number: '1',
    postal_code: '8000',
    city: 'Zürich',
    display_name: 'Test',
  });
  addressId = addr.id;
});

describe('residents repo', () => {
  it('creates resident and retrieves by id', async () => {
    const r = await repo.create({
      address_id: addressId,
      display_name: 'Max',
      type: 'Erwachsener',
    });
    expect(r.id).toBeDefined();
    expect(r.display_name).toBe('Max');
    expect(r.type).toBe('Erwachsener');
  });

  it('findByAddressId returns only residents for given address', async () => {
    const addr2 = await addressRepo.create({
      street: 'Andere',
      house_number: '2',
      postal_code: '8000',
      city: 'Zürich',
      display_name: 'Andere',
    });

    await repo.create({ address_id: addressId, display_name: 'A', type: 'Erwachsener' });
    await repo.create({ address_id: addressId, display_name: 'B', type: 'Kind' });
    await repo.create({ address_id: addr2.id, display_name: 'C', type: 'Erwachsener' });

    const residents = await repo.findByAddressId(addressId);
    expect(residents).toHaveLength(2);
    expect(residents.map((r) => r.display_name)).toEqual(['A', 'B']); // sorted by name
  });

  it('animals always have showbirthday=false regardless of input', async () => {
    const dog = await repo.create({
      address_id: addressId,
      display_name: 'Bello',
      type: 'Hund',
      showbirthday: true, // must be overridden
    });
    expect(dog.showbirthday).toBe(0); // SQLite stores bool as 0/1

    const cat = await repo.create({
      address_id: addressId,
      display_name: 'Mimi',
      type: 'Katze',
      showbirthday: true,
    });
    expect(cat.showbirthday).toBe(0);
  });

  it('animals keep showbirthday=false on update too', async () => {
    const dog = await repo.create({ address_id: addressId, display_name: 'Rex', type: 'Hund' });
    const updated = await repo.update(dog.id, { showbirthday: true });
    expect(updated.showbirthday).toBe(0);
  });

  it('human can have showbirthday=true', async () => {
    const p = await repo.create({
      address_id: addressId,
      display_name: 'Hans',
      type: 'Erwachsener',
      showbirthday: true,
    });
    expect(p.showbirthday).toBe(1);
  });

  it('deletes resident by id', async () => {
    const r = await repo.create({ address_id: addressId, display_name: 'Del', type: 'Kind' });
    await repo.delete(r.id);
    expect(await repo.findById(r.id)).toBeUndefined();
  });

  it('cascade: deleting address removes residents', async () => {
    await repo.create({ address_id: addressId, display_name: 'Cascade', type: 'Erwachsener' });
    await addressRepo.delete(addressId);
    const found = await repo.findByAddressId(addressId);
    expect(found).toHaveLength(0);
  });
});
