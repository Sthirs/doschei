import { createJsonRequest, createTestUserPayload, ensureBackendAvailable } from './helpers/api';

describe('POST /api/auth/login', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('logs in with valid credentials', async () => {
    const payload = createTestUserPayload('login');

    await createJsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await createJsonRequest<{ token: string; user: { email: string; displayName: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      email: payload.email,
      displayName: payload.displayName,
    });
  });

  it('rejects invalid credentials', async () => {
    const payload = createTestUserPayload('invalid-login');

    await createJsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await createJsonRequest<{ message: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: payload.email,
        password: 'not-the-right-password',
      }),
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/invalid/i);
  });
});
