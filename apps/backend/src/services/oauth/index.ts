/**
 * Barrel re-exports for the OAuth service. Importing from
 * `services/oauth` (instead of individual files) keeps the import surface in
 * the T4/T5 controllers tidy.
 */
export type { OAuthProvider, OAuthUserInfo } from './oauthProvider';
export { OidcProvider } from './oidcProvider';
export {
  providerRegistry,
  initOAuthProviders,
} from './providerRegistry';
