import request from 'supertest';

import { createApp } from '../src/app';

describe('backend bootstrap', () => {
  it('returns healthy status', async () => {
    const app = createApp();

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
