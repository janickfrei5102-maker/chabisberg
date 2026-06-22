const { createTestDb } = require('./helpers');
const createAddressRepo = require('../../src/db/addresses');
const createResidentRepo = require('../../src/db/residents');

let db, cleanup, clearAll, repo, residentRepo;

const SAMPLE = {
  street: 'Testgasse',
  house_number: '7',
  postal_code: '8000',
  city: 'Zürich',
  display_name: 'Familie Test',
  lat: 47.37,
  lng: 8.54,
};

beforeAll(async () => {
  ({ db, cleanup, clearAll } = await createTestDb('addresses'));
  repo = createAddressRepo(db);
  residentRepo = createResidentRepo(db);
});

afterAll(() => cleanup());
afterEach(() => clearAll());

describe('addresses repo', () => {
  it('creates and retrieves by id', async () => {
    const created = await repo.create(SAMPLE);
    expect(created.id).toBeDefined();
    expect(created.display_name).toBe('Familie Test');

    const found = await repo.findById(created.id);
    expect(found.street).toBe('Testgasse');
  });

  it('findAll returns all addresses ordered by display_name', async () => {
    await repo.create({ ...SAMPLE, display_name: 'ZZZ' });
    await repo.create({ ...SAMPLE, display_name: 'AAA' });

    const all = await repo.findAll();
    expect(all.length).toBe(2);
    expect(all[0].display_name).toBe('AAA');
  });

  it('updates only the given fields', async () => {
    const a = await repo.create(SAMPLE);
    const updated = await repo.update(a.id, { display_name: 'Neuer Name' });
    expect(updated.display_name).toBe('Neuer Name');
    expect(updated.street).toBe('Testgasse');
  });

  it('deletes address', async () => {
    const a = await repo.create(SAMPLE);
    await repo.delete(a.id);
    const found = await repo.findById(a.id);
    expect(found).toBeUndefined();
  });

  it('findAllForMap returns only addresses with coordinates, with residents nested', async () => {
    const withCoords = await repo.create(SAMPLE);
    const noCoords = await repo.create({
      ...SAMPLE,
      display_name: 'No Coords',
      lat: null,
      lng: null,
    });

    await residentRepo.create({
      address_id: withCoords.id,
      display_name: 'Max',
      type: 'Erwachsener',
    });

    const mapData = await repo.findAllForMap();
    const ids = mapData.map((a) => a.id);

    expect(ids).toContain(withCoords.id);
    expect(ids).not.toContain(noCoords.id);

    const entry = mapData.find((a) => a.id === withCoords.id);
    expect(entry.residents).toHaveLength(1);
    expect(entry.residents[0].display_name).toBe('Max');
  });

  it('findAllForMap returns empty residents array when no residents', async () => {
    await repo.create(SAMPLE);
    const mapData = await repo.findAllForMap();
    expect(mapData[0].residents).toEqual([]);
  });
});
