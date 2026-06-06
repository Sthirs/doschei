import { createJsonRequest, ensureBackendAvailable, registerUser } from './helpers/api';

describe('GET /api/auth/me', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('returns the current user for an authenticated request', async () => {
    const registerResponse = await registerUser('me');

    const response = await createJsonRequest<{ user: { id: string; email: string; displayName: string } }>('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${registerResponse.body.token}`,
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(registerResponse.body.user);
  });

  it('rejects unauthenticated access', async () => {
    const response = await createJsonRequest<{ message: string }>('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });
});
