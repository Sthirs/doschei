import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { createApp } from '../../src/app';

describe('GET /api/auth/config', () => {
  it('returns localLoginEnabled=true and localRegistrationEnabled=true by default', async () => {
    const app = createApp();
    const response = await request(app).get('/api/auth/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      localLoginEnabled: true,
      localRegistrationEnabled: true,
    });
  });

  it('responds with content-type json', async () => {
    const app = createApp();
    const response = await request(app).get('/api/auth/config');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});
