import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Refresh-token secret primitives (ADR-0023). Node `crypto` only — no new
 * dependency.
 *
 * Deliberately NOT bcrypt (`utils/password.ts`): bcrypt is slow on purpose, to
 * defend low-entropy human passwords against offline dictionary attack. A
 * 256-bit CSPRNG secret has no dictionary to attack, so a single SHA-256 is
 * both sufficient and fast enough to sit on the refresh path.
 */

/** 32 random bytes as base64url — 43 chars, all cookie-safe. */
export const generateRefreshSecret = (): string =>
  randomBytes(32).toString('base64url');

/** SHA-256 hex digest (64 chars). Only the digest is ever persisted. */
export const hashRefreshSecret = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');

/**
 * Constant-time comparison of two hex digests. Used as a belt-and-braces
 * re-check after the indexed lookup, so no code path depends on the database
 * index not behaving as an oracle.
 */
export const refreshSecretsMatch = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
};
