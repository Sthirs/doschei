import {
  createJsonRequest,
  createTestUserPayload,
  ensureBackendAvailable,
  readSetCookie,
  REFRESH_COOKIE_NAME,
} from './helpers/api';

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

  // ADR-0023: a successful login is now also a session start. Rotation itself is
  // covered in auth-session-refresh.test.ts; this pins the login endpoint's own
  // half of the contract.
  it('starts a refresh-token session and issues an hour-long access token', async () => {
    const payload = createTestUserPayload('login-session');

    await createJsonRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const response = await createJsonRequest<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    });

    const cookie = readSetCookie(response.headers, REFRESH_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/auth/session');

    const claims = JSON.parse(
      Buffer.from(response.body.token.split('.')[1], 'base64url').toString('utf8'),
    ) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBe(3600);
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
