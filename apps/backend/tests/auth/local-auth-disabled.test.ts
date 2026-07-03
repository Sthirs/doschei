import request from 'supertest';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

describe('local auth disabled', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('POST /api/auth/register returns 403 when registration is disabled', async () => {
    vi.stubEnv('AUTH_LOCAL_REGISTRATION_ENABLED', 'false');
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'pass', displayName: 'Test' });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Local registration is disabled.');
    expect(response.body.code).toBe('local_registration_disabled');
  });

  it('POST /api/auth/register proceeds normally when registration is enabled', async () => {
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'pass', displayName: 'Test' });

    expect(response.status).not.toBe(403);
  });

  it('POST /api/auth/login returns 403 when login is disabled', async () => {
    vi.stubEnv('AUTH_LOCAL_LOGIN_ENABLED', 'false');
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'pass' });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Local login is disabled.');
    expect(response.body.code).toBe('local_login_disabled');
  });

  it('POST /api/auth/login proceeds normally when login is enabled', async () => {
    const { createApp } = await import('../../src/app.js');
    const app = createApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'pass' });

    expect(response.status).not.toBe(403);
  });
});
