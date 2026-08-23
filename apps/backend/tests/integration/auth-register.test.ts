import { createJsonRequest, createTestUserPayload, ensureBackendAvailable } from './helpers/api';

describe('POST /api/auth/register', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('registers a new user with default language "en"', async () => {
    const payload = createTestUserPayload('register');
    const response = await createJsonRequest<{
      token: string;
      user: { email: string; displayName: string; language: 'en' | 'it' };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      email: payload.email,
      displayName: payload.displayName,
      language: 'en',
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

  it('persists the body language "it" and serves it back via GET /api/auth/me', async () => {
    const payload = createTestUserPayload('register-body-it', { language: 'it' });

    const reg = await createJsonRequest<{
      token: string;
      user: { email: string; displayName: string; language: 'en' | 'it' };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.language).toBe('it');

    const me = await createJsonRequest<{ user: { language: 'en' | 'it' } }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${reg.body.token}` },
    });
    expect(me.status).toBe(200);
    expect(me.body.user.language).toBe('it');
  });

  it('falls back to the Accept-Language header when the body has no language', async () => {
    const payload = createTestUserPayload('register-header-it');

    const reg = await createJsonRequest<{ token: string; user: { language: 'en' | 'it' } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Accept-Language': 'it-IT,it;q=0.9' },
      },
    );
    expect(reg.status).toBe(201);
    expect(reg.body.user.language).toBe('it');
  });

  it('falls back to "en" for an unsupported body language (permissive device-capture)', async () => {
    const payload = createTestUserPayload('register-garbage-lang', { language: 'xx-Klingon' });

    const reg = await createJsonRequest<{ token: string; user: { language: 'en' | 'it' } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    expect(reg.status).toBe(201);
    expect(reg.body.user.language).toBe('en');
  });

  it('strips the region suffix from a body language tag', async () => {
    const payload = createTestUserPayload('register-region-it', { language: 'it-IT' });

    const reg = await createJsonRequest<{ token: string; user: { language: 'en' | 'it' } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    expect(reg.status).toBe(201);
    expect(reg.body.user.language).toBe('it');
  });
});
