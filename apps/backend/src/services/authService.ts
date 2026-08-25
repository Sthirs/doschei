import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { invitationService } from './invitationService';
import { hashPassword, verifyPassword } from '../utils/password';

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
  language?: string;
};

export type SupportedLanguage = 'en' | 'it';

/**
 * Normalize a client-supplied language hint into one of the two supported
 * locales. The input can be:
 *
 *   - undefined / null / non-string → 'en' (graceful default)
 *   - a single BCP-47 tag, with or without a region suffix
 *     (`'it'`, `'it-IT'`, `'en-US'`)
 *   - a raw `Accept-Language` header value with comma-separated, q-ranked
 *     segments (`'it-IT,it;q=0.9,en;q=0.8'`) — the first wins
 *   - a `string[]` (e.g. a caller that already parsed the header into an
 *     array) — the first element is processed as above
 *
 * Anything that does not start with `it` after lowercasing and region-
 * stripping falls back to `'en'`. The helper is intentionally permissive
 * — never throws — so the registration and PATCH /me paths cannot be
 * crashed by a malformed client header.
 */
export function normalizeRequestedLanguage(raw: unknown): SupportedLanguage {
  let candidate: unknown;
  if (Array.isArray(raw)) {
    candidate = raw[0];
  } else {
    candidate = raw;
  }
  if (typeof candidate !== 'string') {
    return 'en';
  }
  const lowered = candidate.toLowerCase();
  const firstByComma = lowered.split(',')[0] ?? '';
  const firstByQ = firstByComma.split(';')[0] ?? '';
  const primary = firstByQ.split('-')[0] ?? '';
  return primary === 'it' ? 'it' : 'en';
}

/**
 * Strict validator for an EXPLICITLY-supplied language value (the PATCH
 * /api/auth/me path). Returns the supported locale when the value can be
 * unambiguously mapped to one, otherwise `null` — the controller turns
 * `null` into a 400.
 *
 * Contrast with `normalizeRequestedLanguage`: that helper is permissive
 * and used for DEVICE-derived inputs (Accept-Language header, IdP
 * `locale` claim), where a typo must not block sign-in. The PATCH path
 * takes an EXPLICIT user choice, so an unknown value is a real client
 * error worth surfacing.
 *
 * Accepts:
 *   - a bare tag (`'it'`, `'en'`)
 *   - a tag with region suffix (`'it-IT'`, `'en-US'`); region is stripped
 *     before matching
 *   - leading/trailing whitespace (trimmed before parsing)
 *
 * Rejects:
 *   - non-string input (numbers, objects, arrays, boolean, null,
 *     undefined)
 *   - empty / whitespace-only string
 *   - tags whose primary subtag is neither `'en'` nor `'it'`
 *     (`'fr'`, `'xx'`, `'en-Latn'`)
 */
export function parseLanguage(raw: unknown): SupportedLanguage | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const primary = trimmed.toLowerCase().split('-')[0];
  if (primary === 'en') return 'en';
  if (primary === 'it') return 'it';
  return null;
}

export const sanitizeUser = (user: User) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  language: user.language,
  imageUrl: user.imageUrl ?? null,
});

export class AuthService {
  private userRepository = AppDataSource.getRepository(User);

  async register(input: RegisterInput): Promise<User> {
    const existingUser = await this.userRepository.findOne({ where: { email: input.email.toLowerCase() } });

    if (existingUser) {
      throw new Error('A user with this email already exists.');
    }

    const user = this.userRepository.create({
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      language: normalizeRequestedLanguage(input.language),
    });

    const savedUser = await this.userRepository.save(user);

    // ADR-0014 §42: any new user-creation path MUST also call invitationService.attachPendingInvitationsForEmail(newUser) at this point.
    await invitationService.attachPendingInvitationsForEmail(savedUser);

    return savedUser;
  }

  async login(input: LoginInput): Promise<User> {
    const user = await this.userRepository.findOne({ where: { email: input.email.toLowerCase() } });

    if (!user || !user.passwordHash) {
      throw new Error('Invalid email or password.');
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);

    if (!isValidPassword) {
      throw new Error('Invalid email or password.');
    }

    return user;
  }

  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * Update the authenticated user's profile. Both fields are optional;
   * the caller (authController.updateName) MUST enforce that at least
   * one is provided. Language, if supplied, is restricted to the values
   * produced by `normalizeRequestedLanguage` (`'en' | 'it'`).
   */
  async updateName(
    userId: string,
    displayName: string | undefined,
    language: SupportedLanguage | undefined,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found.');
    }

    if (displayName !== undefined) {
      user.displayName = displayName;
    }
    if (language !== undefined) {
      user.language = language;
    }
    return this.userRepository.save(user);
  }

  /**
   * Update the authenticated user's avatar image.
   * The imageUrl is expected to be a data URL (e.g., data:image/webp;base64,...).
   */
  async updateImage(userId: string, imageUrl: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found.');
    }

    user.imageUrl = imageUrl;
    return this.userRepository.save(user);
  }

  /**
   * Remove the authenticated user's avatar image.
   */
  async deleteImage(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error('User not found.');
    }

    user.imageUrl = null;
    return this.userRepository.save(user);
  }
}
