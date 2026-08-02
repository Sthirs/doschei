/**
 * Pure helpers for building CSV exports.
 *
 * - `csvEscapeField` applies RFC 4180 §2 quoting to a single CSV field.
 * - `sanitizeLatin1Filename` turns arbitrary text into a safe ASCII
 *   filename (Latin-1 alphabet only, dashes for whitespace).
 * - `rfc5987Filename` percent-encodes a UTF-8 filename for the
 *   `filename*=` parameter (RFC 5987 §3.2).
 */

const CSV_SPECIAL_CHARS = /[",\r\n]/;

/**
 * RFC 4180 §2: a field containing a comma, double-quote, or line break
 * must be wrapped in double quotes, with inner quotes doubled.
 * Any other field — including one with plain spaces — is returned as-is.
 */
export const csvEscapeField = (field: string): string => {
  if (!CSV_SPECIAL_CHARS.test(field)) {
    return field;
  }
  return `"${field.replaceAll('"', '""')}"`;
};

const LATIN1_SAFE = /[^A-Za-z0-9._-]/g;
const WHITESPACE_RUNS = /\s+/g;
const REPEATED_DASHES = /-{2,}/g;

/**
 * Builds a filename safe for ASCII-only consumers: trims, replaces runs
 * of whitespace with a single dash, strips every character outside
 * [A-Za-z0-9._-], collapses repeated dashes, and falls back to "export"
 * when nothing remains. Accented characters are removed entirely — they
 * leave no placeholder behind.
 */
export const sanitizeLatin1Filename = (name: string): string => {
  const sanitized = name
    .trim()
    .replaceAll(WHITESPACE_RUNS, '-')
    .replaceAll(LATIN1_SAFE, '')
    .replaceAll(REPEATED_DASHES, '-');
  return sanitized.length > 0 ? sanitized : 'export';
};

// attr-char per RFC 5987 §3.2 — the only characters left unencoded.
const RFC5987_SAFE = /[A-Za-z0-9!#$&+.^_`|~-]/;

/**
 * RFC 5987 §3.2: percent-encodes a UTF-8 filename so it can travel in a
 * `filename*=` parameter. Safe chars pass through; every other UTF-8 byte
 * becomes %HH with uppercase hex. Returns only the encoded value — callers
 * prepend the charset/language prefix.
 */
export const rfc5987Filename = (name: string): string => {
  const bytes = Buffer.from(name, 'utf8');
  let encoded = '';
  for (const byte of bytes) {
    const char = String.fromCharCode(byte);
    encoded += RFC5987_SAFE.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return encoded;
};
