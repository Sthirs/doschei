import request from 'supertest';

import { createApp } from '../src/app';

describe('backend bootstrap', () => {
  it('returns healthy status', async () => {
    const app = createApp();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers a malformed JSON body with a 400 JSON error, not an HTML page', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('message');
  });

  it('gzips JSON responses above the 1 KB threshold when the client accepts it', async () => {
    const app = createApp();
    // No catch-all 404 in createApp, so a route added afterwards still runs
    // behind the global middleware stack, compression included.
    const payload = { items: Array.from({ length: 200 }, (_, index) => ({ index, label: 'expense' })) };
    app.get('/api/__test/large', (_request, response) => {
      response.json(payload);
    });

    const response = await request(app).get('/api/__test/large').set('accept-encoding', 'gzip');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers.vary).toMatch(/accept-encoding/i);
    expect(response.body).toEqual(payload);
  });

  it('leaves small responses uncompressed', async () => {
    const app = createApp();

    const response = await request(app).get('/api/health').set('accept-encoding', 'gzip');

    expect(response.status).toBe(200);
    expect(response.headers['content-encoding']).toBeUndefined();
  });
});
