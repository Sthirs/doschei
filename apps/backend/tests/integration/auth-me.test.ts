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

  // ADR-0023: the frontend's renew-and-retry interceptor is triggered by a 401,
  // so an unverifiable access token MUST produce 401 and not 500. This is the
  // contract the whole silent-renewal path hangs off.
  it('rejects an unverifiable token with 401, not 500', async () => {
    const response = await createJsonRequest<{ message: string }>('/api/auth/me', {
      headers: { Authorization: 'Bearer not-a-jwt' },
    });

    expect(response.status).toBe(401);
  });
});
