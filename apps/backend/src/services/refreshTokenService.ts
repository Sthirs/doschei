/**
 * Re-export barrel for the refresh-token service (ADR-0021: the original
 * module path stays alive as a barrel containing re-exports and nothing else).
 *
 * Split by responsibility:
 *   - refreshTokenSecrets  — CSPRNG generation and hashing
 *   - refreshTokenRotation — issue / rotate / revoke, and the outcome union
 *   - refreshTokenPruning  — retention of consumed and expired rows
 */
export {
  generateRefreshSecret,
  hashRefreshSecret,
  refreshSecretsMatch,
} from './refreshToken/refreshTokenSecrets';

export {
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamilyByRawToken,
} from './refreshToken/refreshTokenRotation';

export type {
  IssuedRefreshToken,
  RevocationReason,
  RotationOutcome,
} from './refreshToken/refreshTokenRotation';

export { pruneExpiredRefreshTokens } from './refreshToken/refreshTokenPruning';
