import { createJsonRequest, createMultipartRequest, ensureBackendAvailable, registerUser } from './helpers/api';

describe('POST /api/auth/me/image', () => {
  beforeAll(async () => {
    await ensureBackendAvailable();
  });

  const smallPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const smallPngBuffer = Buffer.from(smallPngBase64, 'base64');

  const createPngBlob = () => new Blob([smallPngBuffer], { type: 'image/png' });

  it('uploads a small PNG and returns 200 with imageUrl as data:image/webp;base64', async () => {
    const registerResponse = await registerUser('me-image');

    const formData = new FormData();
    formData.append('image', createPngBlob(), 'avatar.png');

    const response = await createMultipartRequest<{
      user: { id: string; email: string; displayName: string; language: 'en' | 'it'; imageUrl: string | null };
    }>('/api/auth/me/image', formData, registerResponse.body.token);

    expect(response.status).toBe(200);
    expect(response.body.user.imageUrl).toBeDefined();
    expect(response.body.user.imageUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it('persists the imageUrl — GET /me returns the same imageUrl', async () => {
    const registerResponse = await registerUser('me-image-persist');

    const formData = new FormData();
    formData.append('image', createPngBlob(), 'avatar.png');

    const uploadResponse = await createMultipartRequest<{
      user: { id: string; email: string; displayName: string; language: 'en' | 'it'; imageUrl: string | null };
    }>('/api/auth/me/image', formData, registerResponse.body.token);

    expect(uploadResponse.status).toBe(200);

    const meResponse = await createJsonRequest<{
      user: { id: string; email: string; displayName: string; language: 'en' | 'it'; imageUrl: string | null };
    }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
    });

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.imageUrl).toBe(uploadResponse.body.user.imageUrl);
  });

  it('rejects oversized files with 413', async () => {
    const registerResponse = await registerUser('me-image-oversize');

    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB > 5 MB limit
    const largeBlob = new Blob([largeBuffer], { type: 'image/png' });

    const formData = new FormData();
    formData.append('image', largeBlob, 'large.png');

    const response = await createMultipartRequest<{ message: string }>(
      '/api/auth/me/image',
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(413);
  });

  it('rejects unsupported MIME type (text/plain) with 415', async () => {
    const registerResponse = await registerUser('me-image-mime');

    const textBlob = new Blob(['not an image'], { type: 'text/plain' });

    const formData = new FormData();
    formData.append('image', textBlob, 'file.txt');

    const response = await createMultipartRequest<{ message: string }>(
      '/api/auth/me/image',
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(415);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const formData = new FormData();
    formData.append('image', createPngBlob(), 'avatar.png');

    const response = await createMultipartRequest<{ message: string }>('/api/auth/me/image', formData);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/missing bearer token/i);
  });

  it('rejects missing file with 400', async () => {
    const registerResponse = await registerUser('me-image-missing');

    const formData = new FormData();
    // No file appended

    const response = await createMultipartRequest<{ message: string }>(
      '/api/auth/me/image',
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/image file is required/i);
  });

  it('rejects invalid/corrupt image data with 422', async () => {
    const registerResponse = await registerUser('me-image-corrupt');

    const corruptBlob = new Blob(['not a valid image'], { type: 'image/png' });

    const formData = new FormData();
    formData.append('image', corruptBlob, 'corrupt.png');

    const response = await createMultipartRequest<{ message: string }>(
      '/api/auth/me/image',
      formData,
      registerResponse.body.token,
    );

    expect(response.status).toBe(422);
  });
});

describe('DELETE /api/auth/me/image', () => {
  const smallPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

  it('clears the profile picture, and GET /me then reports no image', async () => {
    const registerResponse = await registerUser('me-image-delete');
    const token = registerResponse.body.token;
    const formData = new FormData();
    formData.append('image', new Blob([smallPngBuffer], { type: 'image/png' }), 'avatar.png');
    expect((await createMultipartRequest('/api/auth/me/image', formData, token)).status).toBe(200);

    const response = await createJsonRequest<{ user: { imageUrl: string | null } }>('/api/auth/me/image', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.body.user.imageUrl).toBeNull();
    const meResponse = await createJsonRequest<{ user: { imageUrl: string | null } }>('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meResponse.body.user.imageUrl).toBeNull();
  });

  it('is a no-op success when no picture is set', async () => {
    const registerResponse = await registerUser('me-image-delete-none');

    const response = await createJsonRequest<{ user: { imageUrl: string | null } }>('/api/auth/me/image', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${registerResponse.body.token}` },
    });

    expect(response.status).toBe(200);
    expect(response.body.user.imageUrl).toBeNull();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const response = await createJsonRequest('/api/auth/me/image', { method: 'DELETE' });

    expect(response.status).toBe(401);
  });
});
