import { crc32, deflateSync } from 'node:zlib';

import { test, expect } from '@playwright/test';

import { registerUserViaApi } from './fixtures/auth';

/*
 * ADR-0029: static assets (frontend nginx) and API JSON (Express
 * `compression`) are gzip-encoded when the client accepts it. Playwright's
 * request context sends `Accept-Encoding: gzip, deflate, br` and decodes the
 * body transparently, but leaves the response headers intact.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

/** Minimal RGB PNG of random pixels. */
function noisePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolor RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let i = 0; i < rows.length; i += 1) {
    rows[i] = i % (width * 3 + 1) === 0 ? 0 : Math.floor(Math.random() * 256);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Response compression', () => {
  test('hashed JS bundle is served gzip-encoded', async ({ request }) => {
    const shell = await request.get(`${baseURL}/`);
    expect(shell.status()).toBe(200);

    const assetPath = (await shell.text()).match(/\/assets\/[^"']+\.js/)?.[0];
    expect(assetPath, 'index.html references a hashed /assets/*.js bundle').toBeTruthy();

    const asset = await request.get(`${baseURL}${assetPath}`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-encoding']).toBe('gzip');
    expect(asset.headers()['vary'] ?? '').toMatch(/accept-encoding/i);
  });

  test('account API JSON carrying an avatar is served gzip-encoded', async ({ request }) => {
    const user = await registerUserViaApi('e2e-compression');
    const headers = { Authorization: `Bearer ${user.token}` };

    // Noise does not shrink under WebP, so the stored avatar data URL keeps
    // GET /api/auth/me well above the middleware's 1 KB threshold.
    const upload = await request.post(`${baseURL}/api/auth/me/image`, {
      headers,
      multipart: {
        image: { name: 'noise.png', mimeType: 'image/png', buffer: noisePng(256, 256) },
      },
    });
    expect(upload.status()).toBe(200);

    const me = await request.get(`${baseURL}/api/auth/me`, {
      headers: { ...headers, 'Accept-Encoding': 'gzip' },
    });
    expect(me.status()).toBe(200);
    expect((await me.body()).byteLength).toBeGreaterThan(1024);
    expect(me.headers()['content-encoding']).toBe('gzip');
    expect(me.headers()['content-type']).toMatch(/application\/json/);
  });
});
