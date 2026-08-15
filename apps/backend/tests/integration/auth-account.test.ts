import { createJsonRequest, ensureBackendAvailable, registerUser } from './helpers/api';

describe('PATCH /api/auth/me', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  it('updates the display name and persists it', async () => {
    const reg = await registerUser('account');
    const token = reg.body.token;
    const original = reg.body.user;

    const patch = await createJsonRequest<{ user: { id: string; email: string; displayName: string } }>('/api/auth/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'Updated Name' }),
    });
    expect(patch.status).toBe(200);
    expect(patch.body.user.displayName).toBe('Updated Name');

    const reRead = await createJsonRequest<{ user: { id: string; email: string; displayName: string } }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reRead.status).toBe(200);
    expect(reRead.body.user.displayName).toBe('Updated Name');
    expect(reRead.body.user.email).toBe(original.email);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await createJsonRequest<{ message: string }>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'X' }),
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/missing bearer token/i);
  });

  it('rejects empty, whitespace, non-string, and over-length names', async () => {
    const reg = await registerUser('account-invalid');
    const token = reg.body.token;
    for (const displayName of ['   ', 123, 'a'.repeat(101)]) {
      const res = await createJsonRequest<{ message: string }>('/api/auth/me', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ displayName }),
      });
      expect(res.status).toBe(400);
    }
    const missing = await createJsonRequest<{ message: string }>('/api/auth/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
  });

  it('does NOT change the email even when the body supplies one', async () => {
    const reg = await registerUser('account-email');
    const token = reg.body.token;
    const originalEmail = reg.body.user.email;

    const patch = await createJsonRequest<{ user: { id: string; email: string; displayName: string } }>('/api/auth/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName: 'New Name', email: 'attacker@doschei.local' }),
    });
    expect(patch.status).toBe(200);
    expect(patch.body.user.displayName).toBe('New Name');
    expect(patch.body.user.email).toBe(originalEmail);
    expect(patch.body.user.email).not.toBe('attacker@doschei.local');

    const reRead = await createJsonRequest<{ user: { id: string; email: string; displayName: string } }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reRead.status).toBe(200);
    expect(reRead.body.user.email).toBe(originalEmail);
    expect(reRead.body.user.email).not.toBe('attacker@doschei.local');
  });
});
