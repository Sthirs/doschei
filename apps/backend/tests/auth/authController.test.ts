/**
 * Characterization tests for the remaining `authController.ts` handlers
 * (todo 9, `.omo/plans/remove-ai-slop.md`): `register`, `login`, `me`,
 * `authConfig`, `updateImage`, `deleteImage`.
 *
 * `updateName` (PATCH /api/auth/me) already has dedicated, adequate
 * characterization in `tests/auth/auth-controller.test.ts` — this file
 * intentionally does not duplicate that coverage.
 *
 * Strategy: drive the real Express app (`createApp()`) via supertest,
 * stubbing `AuthService.prototype` methods (matching the established
 * `vi.spyOn(...prototype, ...)` pattern used in
 * `tests/oauth/oauth-controller.test.ts`). `AuthService`'s constructor
 * reads a TypeORM repository in a field initializer that runs at
 * construction time (both the controller and `requireAuth` middleware
 * construct singletons at module load), so `../../src/db/data-source`
 * is mocked FIRST to avoid touching real Postgres.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/data-source', () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({})),
    transaction: vi.fn(),
  },
  initializeDatabase: vi.fn(async () => undefined),
}));

vi.mock('../../src/services/imageService', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/services/imageService')>();
  return {
    ...actual,
    normalizeToDataUrl: vi.fn(),
  };
});

import { createApp } from '../../src/app';
import { AuthService } from '../../src/services/authService';
import {
  normalizeToDataUrl,
  UnsupportedImageTypeError,
} from '../../src/services/imageService';

const JWT_SECRET = 'change-me-in-real-environments';
const AUTH_USER = {
  id: 'u1',
  email: 'u@doschei.local',
  displayName: 'Original Name',
  language: 'en' as const,
  imageUrl: null as string | null,
};

function bearerAuth(userId = 'u1') {
  return {
    Authorization: `Bearer ${jwt.sign({ userId, email: AUTH_USER.email }, JWT_SECRET)}`,
  };
}

describe('authController — register/login/me/authConfig/updateImage/deleteImage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // register — POST /api/auth/register
  // ---------------------------------------------------------------
  describe('register', () => {
    it('happy: 201 with { token, user } (sanitized — no passwordHash)', async () => {
      vi.spyOn(AuthService.prototype, 'register').mockResolvedValue({
        id: 'u2',
        email: 'new@doschei.local',
        displayName: 'New',
        language: 'en',
        passwordHash: 'secret-hash',
      } as never);

      const app = createApp();
      const response = await request(app).post('/api/auth/register').send({
        email: 'new@doschei.local',
        password: 'password123',
        displayName: 'New',
      });

      expect(response.status).toBe(201);
      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.user).toEqual({
        id: 'u2',
        email: 'new@doschei.local',
        displayName: 'New',
        language: 'en',
        imageUrl: null,
      });
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('error branch: missing required field → 400 without calling the service', async () => {
      const spy = vi.spyOn(AuthService.prototype, 'register');
      const app = createApp();
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'x@y.com' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Email, password, and display name are required.',
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it('error branch: service throws (duplicate email) → 400 with thrown message', async () => {
      vi.spyOn(AuthService.prototype, 'register').mockRejectedValue(
        new Error('A user with this email already exists.'),
      );

      const app = createApp();
      const response = await request(app).post('/api/auth/register').send({
        email: 'dup@doschei.local',
        password: 'password123',
        displayName: 'Dup',
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'A user with this email already exists.',
      });
    });
  });

  // ---------------------------------------------------------------
  // login — POST /api/auth/login
  // ---------------------------------------------------------------
  describe('login', () => {
    it('happy: 200 with { token, user }', async () => {
      vi.spyOn(AuthService.prototype, 'login').mockResolvedValue({
        ...AUTH_USER,
        passwordHash: 'h',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: AUTH_USER.email, password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.token).toEqual(expect.any(String));
      expect(response.body.user).toEqual({
        id: 'u1',
        email: 'u@doschei.local',
        displayName: 'Original Name',
        language: 'en',
        imageUrl: null,
      });
    });

    it('error branch: service throws (bad credentials) → 401 with thrown message', async () => {
      vi.spyOn(AuthService.prototype, 'login').mockRejectedValue(
        new Error('Invalid email or password.'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nope@doschei.local', password: 'wrong' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: 'Invalid email or password.' });
    });
  });

  // ---------------------------------------------------------------
  // me — GET /api/auth/me
  // ---------------------------------------------------------------
  describe('me', () => {
    it('happy: 200 with { user } from response.locals.user (set by requireAuth)', async () => {
      vi.spyOn(AuthService.prototype, 'findById').mockResolvedValue({
        ...AUTH_USER,
        passwordHash: 'h',
      } as never);

      const app = createApp();
      const response = await request(app).get('/api/auth/me').set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.body.user).toEqual({
        id: 'u1',
        email: 'u@doschei.local',
        displayName: 'Original Name',
        language: 'en',
        imageUrl: null,
      });
    });

    it('error branch: unauthenticated request → 401 (requireAuth short-circuits before the handler)', async () => {
      const app = createApp();
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/missing bearer token/i);
    });
  });

  // ---------------------------------------------------------------
  // authConfig — GET /api/auth/config
  // ---------------------------------------------------------------
  describe('authConfig', () => {
    it('happy: 200 with { localLoginEnabled, localRegistrationEnabled } — no auth required', async () => {
      const app = createApp();
      const response = await request(app).get('/api/auth/config');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        localLoginEnabled: expect.any(Boolean),
        localRegistrationEnabled: expect.any(Boolean),
      });
    });
  });

  // ---------------------------------------------------------------
  // updateImage — POST /api/auth/me/image
  // ---------------------------------------------------------------
  describe('updateImage', () => {
    beforeEach(() => {
      vi.spyOn(AuthService.prototype, 'findById').mockResolvedValue({
        ...AUTH_USER,
        passwordHash: 'h',
      } as never);
    });

    it('happy: 200 with { user } reflecting the new imageUrl', async () => {
      vi.mocked(normalizeToDataUrl).mockResolvedValue(
        'data:image/png;base64,AAA',
      );
      vi.spyOn(AuthService.prototype, 'updateImage').mockResolvedValue({
        ...AUTH_USER,
        imageUrl: 'data:image/png;base64,AAA',
        passwordHash: 'h',
      } as never);

      const app = createApp();
      const response = await request(app)
        .post('/api/auth/me/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(200);
      expect(response.body.user.imageUrl).toBe('data:image/png;base64,AAA');
    });

    it('error branch: no file attached → 400 without calling the service', async () => {
      const spy = vi.spyOn(AuthService.prototype, 'updateImage');
      const app = createApp();
      const response = await request(app)
        .post('/api/auth/me/image')
        .set(bearerAuth());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'Image file is required.' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('error branch: UnsupportedImageTypeError → 415', async () => {
      vi.mocked(normalizeToDataUrl).mockRejectedValue(
        new UnsupportedImageTypeError('image/gif'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/auth/me/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(415);
    });

    it('error branch: sharp decode failure message → 422 { message: "Invalid image file." }', async () => {
      vi.mocked(normalizeToDataUrl).mockRejectedValue(
        new Error('Input buffer contains unsupported image format'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/auth/me/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ message: 'Invalid image file.' });
    });

    it('error branch: any other service error → 400 with thrown message (no 404 branch exists here)', async () => {
      vi.mocked(normalizeToDataUrl).mockResolvedValue(
        'data:image/png;base64,AAA',
      );
      vi.spyOn(AuthService.prototype, 'updateImage').mockRejectedValue(
        new Error('User not found.'),
      );

      const app = createApp();
      const response = await request(app)
        .post('/api/auth/me/image')
        .set(bearerAuth())
        .attach('image', Buffer.from('fake-png-bytes'), {
          filename: 'a.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'User not found.' });
    });
  });

  // ---------------------------------------------------------------
  // deleteImage — DELETE /api/auth/me/image
  // ---------------------------------------------------------------
  describe('deleteImage', () => {
    beforeEach(() => {
      vi.spyOn(AuthService.prototype, 'findById').mockResolvedValue({
        ...AUTH_USER,
        passwordHash: 'h',
      } as never);
    });

    it('happy: 200 with { user } imageUrl cleared', async () => {
      vi.spyOn(AuthService.prototype, 'deleteImage').mockResolvedValue({
        ...AUTH_USER,
        imageUrl: null,
        passwordHash: 'h',
      } as never);

      const app = createApp();
      const response = await request(app)
        .delete('/api/auth/me/image')
        .set(bearerAuth());

      expect(response.status).toBe(200);
      expect(response.body.user.imageUrl).toBeNull();
    });

    it('error branch: service throws → 400 with thrown message (no 404 branch exists here)', async () => {
      vi.spyOn(AuthService.prototype, 'deleteImage').mockRejectedValue(
        new Error('User not found.'),
      );

      const app = createApp();
      const response = await request(app)
        .delete('/api/auth/me/image')
        .set(bearerAuth());

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'User not found.' });
    });
  });
});
