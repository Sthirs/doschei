import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class UnsupportedImageTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported image type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
    this.name = 'UnsupportedImageTypeError';
  }
}

export function assertAllowedMimeType(mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new UnsupportedImageTypeError(mimeType);
  }
}

export async function normalizeToDataUrl(buffer: Buffer, mimeType: string): Promise<string> {
  assertAllowedMimeType(mimeType);

  const processed = await sharp(buffer)
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  return `data:image/webp;base64,${processed.toString('base64')}`;
}
