/**
 * Single owner of the access-token storage key.
 *
 * The literal used to be duplicated in `lib/api.ts`, `stores/auth.ts`, and
 * `components/group-detail/ExportModal.vue`. The VALUE must not change:
 * `lib/appVersion.ts`'s ADR-0020 invariant (the deploy purge keeps the user
 * signed in) and `tests/e2e/fixtures/auth.ts` both depend on this exact string.
 *
 * Only the short-lived ACCESS token lives here. The refresh token is an
 * httpOnly cookie by design (ADR-0023) and is deliberately unreachable from
 * JavaScript — there is nothing for this module to do with it.
 */
export const ACCESS_TOKEN_KEY = 'doschei.auth.token';

export const getAccessToken = (): string | null =>
  localStorage.getItem(ACCESS_TOKEN_KEY);

export const setAccessToken = (token: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

export const clearAccessToken = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
};
