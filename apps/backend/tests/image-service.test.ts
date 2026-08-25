import { describe, it, expect } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME_TYPES,
  assertAllowedMimeType,
  normalizeToDataUrl,
  UnsupportedImageTypeError,
} from '../src/services/imageService';

// Minimal valid PNG (1x1 transparent pixel)
const SMALL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

describe('imageService', () => {
  describe('constants', () => {
    it('MAX_UPLOAD_BYTES is 5MB', () => {
      expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    });

    it('ALLOWED_MIME_TYPES contains expected types', () => {
      expect(ALLOWED_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    });
  });

  describe('assertAllowedMimeType', () => {
    it('allows image/jpeg', () => {
      expect(() => assertAllowedMimeType('image/jpeg')).not.toThrow();
    });

    it('allows image/png', () => {
      expect(() => assertAllowedMimeType('image/png')).not.toThrow();
    });

    it('allows image/webp', () => {
      expect(() => assertAllowedMimeType('image/webp')).not.toThrow();
    });

    it('throws UnsupportedImageTypeError for image/gif', () => {
      expect(() => assertAllowedMimeType('image/gif')).toThrow(UnsupportedImageTypeError);
    });

    it('throws UnsupportedImageTypeError for application/pdf', () => {
      expect(() => assertAllowedMimeType('application/pdf')).toThrow(UnsupportedImageTypeError);
    });

    it('throws UnsupportedImageTypeError for empty string', () => {
      expect(() => assertAllowedMimeType('')).toThrow(UnsupportedImageTypeError);
    });

    it('error message includes the invalid mime type', () => {
      try {
        assertAllowedMimeType('image/gif');
      } catch (e) {
        expect(e).toBeInstanceOf(UnsupportedImageTypeError);
        expect((e as Error).message).toContain('image/gif');
      }
    });
  });

  describe('normalizeToDataUrl', () => {
    it('converts small PNG to data:image/webp;base64,...', async () => {
      const result = await normalizeToDataUrl(SMALL_PNG, 'image/png');

      expect(result).toMatch(/^data:image\/webp;base64,/);
      expect(result.length).toBeGreaterThan('data:image/webp;base64,'.length);
    });

it('converts WebP to data:image/webp;base64,...', async () => {
      // Minimal WebP (1x1 pixel)
      const smallWebp = Buffer.from(
        'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
        'base64'
      );

      const result = await normalizeToDataUrl(smallWebp, 'image/webp');
      expect(result).toMatch(/^data:image\/webp;base64,/);
    });

    it('throws UnsupportedImageTypeError for unsupported mime type', async () => {
      await expect(normalizeToDataUrl(SMALL_PNG, 'image/gif')).rejects.toThrow(UnsupportedImageTypeError);
    });

    it('rejects garbage buffer with sharp error', async () => {
      const garbage = Buffer.from('not an image at all');
      await expect(normalizeToDataUrl(garbage, 'image/png')).rejects.toThrow();
    });

    it('output is valid base64', async () => {
      const result = await normalizeToDataUrl(SMALL_PNG, 'image/png');
      const base64Part = result.replace('data:image/webp;base64,', '');
      expect(() => Buffer.from(base64Part, 'base64')).not.toThrow();
    });
  });
});
