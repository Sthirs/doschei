import { createJsonRequest, createTestUserPayload, ensureBackendAvailable } from './helpers/api';

describe('POST /api/auth/register', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('registers a new user', async () => {
    const payload = createTestUserPayload('register');
    const response = await createJsonRequest<{ token: string; user: { email: string; displayName: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      email: payload.email,
      displayName: payload.displayName,
    });
  });

  it('rejects duplicate registration email', async () => {
    const payload = createTestUserPayload('duplicate-register');

    await createJsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await createJsonRequest<{ message: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/already exists/i);
  });
});
