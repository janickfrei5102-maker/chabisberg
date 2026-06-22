/**
 * Profile self-management tests.
 *
 * Critical invariants verified:
 *   1. Unauthenticated access → 302 redirect.
 *   2. Resident CAN manage residents at their OWN address.
 *   3. Resident CANNOT manage residents at a FOREIGN address → 403/404.
 *   4. Address update only touches display_name (no lat/lng/street changes via body).
 *   5. showbirthday is forced false for animals (server-side enforcement).
 *   6. address_id on resident create always comes from session, never from body.
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

// ─── Access control ───────────────────────────────────────────────────────────

describe('GET /profile — access control', () => {
  it('redirects guest to login', async () => {
    const res = await request(app).get('/profile');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('returns 200 for authenticated resident with address', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'resA', address_id: addr.id });
    const agent = await loginAs('resA');
    const res = await agent.get('/profile');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Mein Profil');
  });

  it('returns 403 for user without address', async () => {
    await createUser(db, { username: 'noaddr', address_id: null });
    const agent = await loginAs('noaddr');
    const res = await agent.get('/profile');
    expect(res.status).toBe(403);
  });
});

// ─── Address display_name update ──────────────────────────────────────────────

describe('POST /profile/address', () => {
  it('updates display_name of own address', async () => {
    const addr = await createAddress(db, { display_name: 'Alt' });
    await createUser(db, { username: 'ownerA', address_id: addr.id });
    const agent = await loginAs('ownerA');

    const res = await agent.post('/profile/address').send({ display_name: 'Neu' });
    expect(res.status).toBe(302);

    const updated = await db('addresses').where({ id: addr.id }).first();
    expect(updated.display_name).toBe('Neu');
    // Verify other fields unchanged
    expect(updated.street).toBe(addr.street);
  });

  it('ignores attempts to change street via body (whitelist enforced)', async () => {
    const addr = await createAddress(db, { street: 'Originalgasse' });
    await createUser(db, { username: 'ownerB', address_id: addr.id });
    const agent = await loginAs('ownerB');

    await agent.post('/profile/address').send({ display_name: 'X', street: 'Hacked' });

    const unchanged = await db('addresses').where({ id: addr.id }).first();
    expect(unchanged.street).toBe('Originalgasse');
  });
});

// ─── Resident CRUD — own address ──────────────────────────────────────────────

describe('POST /profile/residents — create', () => {
  it('creates resident at own address (address_id from session)', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'ownerC', address_id: addr.id });
    const agent = await loginAs('ownerC');

    const res = await agent.post('/profile/residents').send({
      display_name: 'Max Mustermann',
      type: 'Erwachsener',
      claim: 'Gärtner',
      showbirthday: 'on',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/profile');

    const created = await db('residents').where({ display_name: 'Max Mustermann' }).first();
    expect(created).toBeDefined();
    // CRITICAL: address_id must match session address, not any body-supplied value
    expect(created.address_id).toBe(addr.id);
  });

  it('address_id injection via body is ignored', async () => {
    const addr1 = await createAddress(db, { display_name: 'Meine Adresse' });
    const addr2 = await createAddress(db, { display_name: 'Fremde Adresse' });
    await createUser(db, { username: 'ownerD', address_id: addr1.id });
    const agent = await loginAs('ownerD');

    await agent.post('/profile/residents').send({
      display_name: 'Eingeschleuster Resident',
      type: 'Erwachsener',
      // Attempt to inject a foreign address_id
      address_id: addr2.id,
    });

    const r = await db('residents').where({ display_name: 'Eingeschleuster Resident' }).first();
    if (r) {
      // If created, must be at own address, not foreign
      expect(r.address_id).toBe(addr1.id);
    }
    // No resident should appear at addr2
    const atForeign = await db('residents').where({ address_id: addr2.id }).select('id');
    expect(atForeign).toHaveLength(0);
  });
});

describe('POST /profile/residents/:id — edit authorization', () => {
  it('resident can edit their OWN resident', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'ownerE', address_id: addr.id });
    const [rid] = await db('residents').insert({
      address_id: addr.id,
      display_name: 'Alter Name',
      type: 'Erwachsener',
    });

    const agent = await loginAs('ownerE');
    const res = await agent.post(`/profile/residents/${rid}`).send({
      display_name: 'Neuer Name',
      type: 'Erwachsener',
    });
    expect(res.status).toBe(302);

    const updated = await db('residents').where({ id: rid }).first();
    expect(updated.display_name).toBe('Neuer Name');
  });

  /**
   * CRITICAL: resident MUST NOT be able to edit a resident at a foreign address.
   * If this test fails, the app has a serious authorization vulnerability.
   */
  it('BLOCKS resident from editing a resident at foreign address', async () => {
    const addrOwn = await createAddress(db, { display_name: 'Eigene' });
    const addrForeign = await createAddress(db, { display_name: 'Fremd' });
    await createUser(db, { username: 'ownerF', address_id: addrOwn.id });
    const [foreignRid] = await db('residents').insert({
      address_id: addrForeign.id,
      display_name: 'Fremd-Resident',
      type: 'Erwachsener',
    });

    const agent = await loginAs('ownerF');
    const res = await agent.post(`/profile/residents/${foreignRid}`).send({
      display_name: 'Gehackt',
      type: 'Erwachsener',
    });

    expect(res.status).toBe(403);

    // Name must be unchanged
    const unchanged = await db('residents').where({ id: foreignRid }).first();
    expect(unchanged.display_name).toBe('Fremd-Resident');
  });
});

describe('POST /profile/residents/:id/delete — authorization', () => {
  it('resident can delete their OWN resident', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'ownerG', address_id: addr.id });
    const [rid] = await db('residents').insert({
      address_id: addr.id,
      display_name: 'ZumLöschen',
      type: 'Kind',
    });

    const agent = await loginAs('ownerG');
    await agent.post(`/profile/residents/${rid}/delete`).expect(302);

    const gone = await db('residents').where({ id: rid }).first();
    expect(gone).toBeUndefined();
  });

  /**
   * CRITICAL: deleting a foreign resident MUST be blocked.
   */
  it('BLOCKS resident from deleting a resident at foreign address', async () => {
    const addrOwn = await createAddress(db, { display_name: 'Eigene2' });
    const addrForeign = await createAddress(db, { display_name: 'Fremd2' });
    await createUser(db, { username: 'ownerH', address_id: addrOwn.id });
    const [foreignRid] = await db('residents').insert({
      address_id: addrForeign.id,
      display_name: 'Zu-Schützen',
      type: 'Erwachsener',
    });

    const agent = await loginAs('ownerH');
    const res = await agent.post(`/profile/residents/${foreignRid}/delete`);
    expect(res.status).toBe(403);

    const still = await db('residents').where({ id: foreignRid }).first();
    expect(still).toBeDefined();
  });
});

// ─── showbirthday enforcement for animals ─────────────────────────────────────

describe('showbirthday forced false for animals', () => {
  it('ignores showbirthday=on for Katze', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'ownerI', address_id: addr.id });
    const agent = await loginAs('ownerI');

    await agent.post('/profile/residents').send({
      display_name: 'Mimi',
      type: 'Katze',
      birthday: '2020-03-01',
      showbirthday: 'on', // attempt to show birthday for cat
    });

    const cat = await db('residents').where({ display_name: 'Mimi' }).first();
    expect(cat).toBeDefined();
    // Must be false regardless of what was submitted
    expect(cat.showbirthday).toBeFalsy();
  });

  it('ignores showbirthday=on for Hund', async () => {
    const addr = await createAddress(db);
    await createUser(db, { username: 'ownerJ', address_id: addr.id });
    const agent = await loginAs('ownerJ');

    await agent.post('/profile/residents').send({
      display_name: 'Bello',
      type: 'Hund',
      birthday: '2019-06-15',
      showbirthday: 'on',
    });

    const dog = await db('residents').where({ display_name: 'Bello' }).first();
    expect(dog).toBeDefined();
    expect(dog.showbirthday).toBeFalsy();
  });
});
