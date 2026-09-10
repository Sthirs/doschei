/**
 * Unit tests for the refresh-token secret primitives (ADR-0023).
 *
 * These are the credential itself, so the properties worth pinning are
 * entropy (never repeat), cookie-safety of the encoding, and that only a
 * digest is ever comparable.
 */
import { describe, expect, it } from 'vitest';

import {
  generateRefreshSecret,
  hashRefreshSecret,
  refreshSecretsMatch,
} from '../../src/services/refreshToken/refreshTokenSecrets';

describe('generateRefreshSecret', () => {
  it('returns 32 bytes encoded as 43 base64url characters', () => {
    const secret = generateRefreshSecret();
    expect(secret).toHaveLength(43);
    // base64url only — no '+', '/' or '=' , all of which need escaping in a
    // Set-Cookie value.
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats across 1000 draws', () => {
    const drawn = new Set(
      Array.from({ length: 1000 }, () => generateRefreshSecret()),
    );
    expect(drawn.size).toBe(1000);
  });
});

describe('hashRefreshSecret', () => {
  it('returns a 64-character lowercase hex SHA-256 digest', () => {
    expect(hashRefreshSecret('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const raw = generateRefreshSecret();
    expect(hashRefreshSecret(raw)).toBe(hashRefreshSecret(raw));
  });

  it('matches the known SHA-256 of "abc"', () => {
    expect(hashRefreshSecret('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('changes completely for a single-character difference', () => {
    const a = hashRefreshSecret('secret-a');
    const b = hashRefreshSecret('secret-b');
    expect(a).not.toBe(b);
    expect(a).toHaveLength(b.length);
  });
});

describe('refreshSecretsMatch', () => {
  it('is true for identical digests', () => {
    const digest = hashRefreshSecret(generateRefreshSecret());
    expect(refreshSecretsMatch(digest, digest)).toBe(true);
  });

  it('is false for different digests of the same length', () => {
    expect(
      refreshSecretsMatch(hashRefreshSecret('a'), hashRefreshSecret('b')),
    ).toBe(false);
  });

  it('is false — and does not throw — on a length mismatch', () => {
    // timingSafeEqual throws on unequal buffer lengths, so the guard has to
    // come first. A stored value truncated by a bad migration must return
    // false, not crash the refresh endpoint.
    expect(refreshSecretsMatch('abcd', hashRefreshSecret('a'))).toBe(false);
    expect(refreshSecretsMatch('', 'a')).toBe(false);
  });
});
