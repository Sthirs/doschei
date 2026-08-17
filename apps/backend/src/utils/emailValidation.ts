/**
 * Email format validation.
 *
 * The domain label class excludes `.` so the split between `[^\s@.]+` and the
 * `(\.[^\s@.]+)+` group is unambiguous. This avoids the polynomial backtracking
 * (ReDoS) that the previous `[^\s@]+\.[^\s@]+` pattern exhibited on adversarial
 * inputs beginning with `!@!.` followed by many `!.` repetitions — the `.`
 * character belonged to both `[^\s@]+` and the literal `\.`, forcing the engine
 * to try every dot position.
 *
 * As a side effect of the unambiguous split this pattern is also stricter and
 * more correct: it rejects domains with leading, trailing, or consecutive dots
 * (`user@.example.com`, `user@example.com.`, `user@example..com`) which the
 * previous pattern incorrectly accepted.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const EMAIL_MAX_LENGTH = 254;

/**
 * @param email - untrusted request body value
 * @returns `true` when `email` is a string that trims to a plausible email
 *   address (`local@domain.tld`) and is at most 254 characters long. Acts as a
 *   type guard so callers can use `email` as a `string` after a passing check.
 */
export const isValidEmail = (email: unknown): email is string => {
  if (typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > EMAIL_MAX_LENGTH) {
    return false;
  }
  return EMAIL_PATTERN.test(trimmed);
};
