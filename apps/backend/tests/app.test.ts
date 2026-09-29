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
});
