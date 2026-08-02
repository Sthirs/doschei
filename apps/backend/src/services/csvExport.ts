/**
 * Reconsidered (vs ADR-0011 §Alternatives): STILL keep in-house, no library.
 * Flip to `csv-stringify` (Node streaming CSV writer, Papa Parse server-side
 * sibling) IF formula-injection mitigation (CWE-1236) must cover Excel/Sheets
 * quirks beyond a leading-`'` prefix, OR if multi-currency / arbitrary-
 * delimiter / TSV exports are added. Its stringifier maps cleanly onto the
 * new `startExpensesCsv` async-iterable shape — this refactor does not
 * foreclose adopting it later.
 */

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

/**
 * Header metadata describing a streamed CSV response. The controller applies
 * these via `res.setHeader(...)` + `res.flushHeaders()` before iterating the
 * row stream — keeping all Express I/O out of the service layer.
 */
export interface CsvExportHeaders {
  contentType: string;
  contentDisposition: string;
  cacheControl: string;
}

/**
 * Result of `GroupService.startExpensesCsv`: header metadata + an async
 * iterable of pre-formatted RFC-4180 row strings (each including the
 * trailing `\r\n`). The consumer iterates one row at a time and writes it
 * straight to the sink — the service never accumulates the whole CSV in
 * memory, never touches disk, and never imports Express.
 */
export interface CsvExportStream {
  headers: CsvExportHeaders;
  rows: AsyncIterable<string>;
}

/**
 * Pure per-expense net (ADR-0006 integer-cent math): for each member `m`,
 * `net(m) = (m is the payer ? amount : 0) − Σ split.computedAmount where
 * split.userId === m`. `+` means the member will receive (creditor); `−`
 * means they owe (debtor). Same formula for expenses and settlements —
 * do not invert by `kind`. Inputs are primitives so the helper stays free
 * of entity-coupling and is unit-testable without a database.
 */
export const formatMemberNet = (
  paidByUserId: string,
  memberId: string,
  amount: number,
  splits: ReadonlyArray<{ userId: string; computedAmount: number }>,
): string => {
  const paidCents = paidByUserId === memberId ? Math.round(amount * 100) : 0;
  const owedCents = splits
    .filter((split) => split.userId === memberId)
    .reduce((acc, split) => acc + Math.round(split.computedAmount * 100), 0);
  return ((paidCents - owedCents) / 100).toFixed(2);
};
