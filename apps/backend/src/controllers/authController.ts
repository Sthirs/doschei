/**
 * Re-export barrel for the auth controller (ADR-0021).
 *
 * The original module path stays alive containing re-exports and NOTHING
 * else — no logic, no instantiation, no re-wrapping. That is what keeps
 * `routes/authRoutes.ts` and every existing `tests/auth/*` and
 * `tests/oauth/*` import specifier valid across the split.
 *
 * Handlers live in `controllers/auth/`, one file per responsibility:
 *   - localAuthHandlers   — register, login (email + password)
 *   - profileHandlers     — me, updateName
 *   - authConfigHandlers  — authConfig
 *   - imageHandlers       — updateImage, deleteImage
 *   - sessionHandlers     — refresh, logout (refresh-token rotation)
 *   - authServiceInstance — the single `new AuthService()`
 */
export { login, register } from './auth/localAuthHandlers';
export { me, updateName } from './auth/profileHandlers';
export { authConfig } from './auth/authConfigHandlers';
export { deleteImage, updateImage } from './auth/imageHandlers';
export { logout, refresh } from './auth/sessionHandlers';
