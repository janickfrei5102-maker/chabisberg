const request = require('supertest');
const app = require('../src/app');

describe('App scaffold', () => {
  it('redirects unauthenticated / to login', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });

  it('serves login page', async () => {
    const res = await request(app).get('/auth/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Anmelden');
  });

  it('redirects unauthenticated /admin to login', async () => {
    const res = await request(app).get('/admin');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/auth/login');
  });
});
