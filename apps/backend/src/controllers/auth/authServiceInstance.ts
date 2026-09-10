import { AuthService } from '../../services/authService';

/**
 * The single `AuthService` construction for the whole process (ADR-0021: a
 * shared value gets its own named module rather than a grab bag, and
 * `grep -rn "new AuthService()" apps/backend/src` must return exactly one
 * match). Direct analogue of `controllers/group/groupServiceInstance.ts`.
 */
export const authService = new AuthService();
