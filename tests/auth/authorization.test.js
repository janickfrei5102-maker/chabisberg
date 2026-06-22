/**
 * Authorization Middleware Unit Tests
 *
 * These tests exercise the authorization middleware functions in isolation,
 * without an HTTP server. They mock the (req, res, next) Express triple
 * and verify that:
 *
 *   - Admin bypasses ALL address checks.
 *   - Resident is blocked from writing to a foreign address.
 *   - Resident CAN write to their OWN address.
 *   - Resident without address_id is blocked from ALL writes.
 *   - Unauthenticated requests are redirected to login.
 *   - requireCanLinkUser follows the same resident/admin rules.
 *
 * Why unit tests and not integration tests here:
 * These rules are pure middleware logic. They don't require a running HTTP
 * server or database to test. Unit tests are faster and make the invariants
 * explicit without the noise of full HTTP round-trips.
 *
 * Integration-level auth tests (which DO exercise the full stack) live in
 * tests/auth/auth.test.js and in per-feature route tests.
 */

const {
  requireAuth,
  requireAdmin,
  requireOwnsAddress,
  requireCanLinkUser,
} = require('../../src/middleware/requireAuth');

/** Build a minimal mock res object */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.render = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/** Build a mock req with the given session.user and optional body/params */
function mockReq({ user = null, body = {}, params = {}, originalUrl = '/' } = {}) {
  return { session: { user }, body, params, originalUrl };
}

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('calls next() when user is authenticated', () => {
    const req = mockReq({ user: { id: 1, role: 'resident', address_id: 1 } });
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('redirects to /auth/login when unauthenticated', () => {
    const req = mockReq({ user: null, originalUrl: '/profile' });
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('/auth/login'));
  });
});

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('calls next() for admin role', () => {
    const req = mockReq({ user: { id: 1, role: 'admin', address_id: null } });
    const next = jest.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 for resident role', () => {
    const req = mockReq({ user: { id: 2, role: 'resident', address_id: 1 } });
    const res = mockRes();
    const next = jest.fn();

    requireAdmin(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('redirects unauthenticated to login', () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    requireAdmin(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
  });
});

// ─── requireOwnsAddress ───────────────────────────────────────────────────────

describe('requireOwnsAddress', () => {
  /**
   * CRITICAL: Admin bypass.
   * Admin must be able to modify any address without restriction.
   */
  it('allows admin to access any address', async () => {
    const req = mockReq({ user: { id: 1, role: 'admin', address_id: 1 } });
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => 999); // completely different address
    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  /**
   * CRITICAL: Resident can access their OWN address.
   * This must pass so residents can actually manage their data.
   */
  it('allows resident to access own address', async () => {
    const req = mockReq({ user: { id: 2, role: 'resident', address_id: 5 } });
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => 5); // matches address_id in session
    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  /**
   * CRITICAL: Resident is BLOCKED from writing to a foreign address.
   * This is the core authorization invariant of the entire application.
   * If this test fails, the app has a serious security vulnerability.
   */
  it('BLOCKS resident from accessing another address', async () => {
    const req = mockReq({ user: { id: 2, role: 'resident', address_id: 5 } });
    const res = mockRes();
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => 99); // DIFFERENT address
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  /**
   * Type coercion safety: params arrive as strings, session stores numbers.
   * The middleware must handle both correctly. A strict === comparison would
   * always fail, blocking all residents from modifying their own data.
   */
  it('handles string vs number address_id correctly', async () => {
    const req = mockReq({ user: { id: 3, role: 'resident', address_id: 7 } });
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => '7'); // string from URL param
    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when resident has no address_id in session', async () => {
    const req = mockReq({ user: { id: 4, role: 'resident', address_id: null } });
    const res = mockRes();
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => 1);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 404 when getAddressId returns null (resource not found)', async () => {
    const req = mockReq({ user: { id: 5, role: 'resident', address_id: 1 } });
    const res = mockRes();
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => null); // e.g., resident not found in DB
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('redirects unauthenticated to login', async () => {
    const req = mockReq({ user: null });
    const res = mockRes();
    const next = jest.fn();

    const middleware = requireOwnsAddress(() => 1);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/auth/login');
  });

  it('supports async getAddressId (DB lookup)', async () => {
    const req = mockReq({ user: { id: 6, role: 'resident', address_id: 42 } });
    const next = jest.fn();

    // Simulates looking up a resident's address_id from DB
    const getAddressId = () => Promise.resolve(42);
    const middleware = requireOwnsAddress(getAddressId);
    await middleware(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
  });

  /**
   * Async foreign address MUST be blocked too.
   * This covers the case where address_id is resolved from a DB lookup
   * (e.g., DELETE /residents/:id → look up resident → get address_id).
   */
  it('BLOCKS resident even when address_id resolved via async lookup (foreign)', async () => {
    const req = mockReq({ user: { id: 7, role: 'resident', address_id: 42 } });
    const res = mockRes();
    const next = jest.fn();

    // Simulates: look up resident 99 → it belongs to address 55 (not 42)
    const getAddressId = () => Promise.resolve(55);
    const middleware = requireOwnsAddress(getAddressId);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ─── requireCanLinkUser ───────────────────────────────────────────────────────

describe('requireCanLinkUser', () => {
  it('allows admin to link user to any address', () => {
    const req = mockReq({
      user: { id: 1, role: 'admin', address_id: 1 },
      body: { address_id: 99 },
    });
    const next = jest.fn();
    requireCanLinkUser(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('allows resident to link user to their own address', () => {
    const req = mockReq({
      user: { id: 2, role: 'resident', address_id: 5 },
      body: { address_id: '5' }, // string from form
    });
    const next = jest.fn();
    requireCanLinkUser(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('BLOCKS resident from linking user to foreign address', () => {
    const req = mockReq({
      user: { id: 2, role: 'resident', address_id: 5 },
      body: { address_id: '99' },
    });
    const res = mockRes();
    const next = jest.fn();
    requireCanLinkUser(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('also reads address_id from params', () => {
    const req = mockReq({
      user: { id: 3, role: 'resident', address_id: 7 },
      params: { address_id: '7' },
      body: {},
    });
    const next = jest.fn();
    requireCanLinkUser(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
