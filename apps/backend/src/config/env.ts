import dotenv from 'dotenv';
import { generateVAPIDKeys } from 'web-push';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().default('change-me-in-real-environments'),
  DB_HOSTNAME: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_USERNAME: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_DATABASE_NAME: z.string().optional(),
  DB_SYNC: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  AUTH_LOCAL_LOGIN_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  AUTH_LOCAL_REGISTRATION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  SEED_ON_STARTUP: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return 300000;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 2147483647) {
        throw new Error(
          'RATE_LIMIT_WINDOW_MS must be a positive integer <= 2147483647 (MemoryStore setInterval cap)',
        );
      }
      return parsed;
    }),
  RATE_LIMIT_LIMIT: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return 500;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(
          'RATE_LIMIT_LIMIT must be a positive integer (> 0); values <= 0 block all traffic in express-rate-limit >= 7',
        );
      }
      return parsed;
    }),
  // ADR-0023 session lifetimes. Integers of SECONDS, following the
  // RATE_LIMIT_* house pattern: blank-tolerant, fail-fast on a value that
  // would silently break sessions.
  ACCESS_TOKEN_TTL_SECONDS: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return 3600;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(
          'ACCESS_TOKEN_TTL_SECONDS must be a positive integer number of seconds',
        );
      }
      return parsed;
    }),
  REFRESH_TOKEN_TTL_SECONDS: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return 7776000;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(
          'REFRESH_TOKEN_TTL_SECONDS must be a positive integer number of seconds',
        );
      }
      return parsed;
    }),
  // 0 disables the grace window entirely (every replay counts as theft).
  REFRESH_TOKEN_REUSE_GRACE_SECONDS: z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return 30;
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(
          'REFRESH_TOKEN_REUSE_GRACE_SECONDS must be a non-negative integer number of seconds',
        );
      }
      return parsed;
    }),
  CORS_ORIGIN: z.string().default('http://doschei.127.0.0.1.nip.io'),
  OAUTH_CONFIG: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const parsed = JSON.parse(val);
      return z
        .object({
          autoLaunch: z.boolean().default(false),
          autoRegister: z.boolean().default(true),
          buttonText: z.string().default('Sign in with OAuth'),
          clientId: z.string(),
          clientSecret: z.string(),
          enabled: z.boolean().default(true),
          issuerUrl: z.string(),
          scope: z.string().default('openid email profile'),
        })
        .parse(parsed);
    }),
  FRONTEND_URL: z.string().optional(),
  OAUTH_STATE_SECRET: z.string().optional(),
  // ADR-0025: Web Push. Both optional — push degrades to a no-op when either
  // is absent, so environments (and the whole test suite) that never
  // provision a VAPID keypair keep working unmodified.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:noreply@doschei.local'),
  // Dev-only convenience: mint an ephemeral keypair at boot instead of
  // provisioning a real one. Gated behind an explicit flag (rather than
  // NODE_ENV) so a production deployment that forgot to provision a keypair
  // fails closed to "push disabled" instead of silently generating one that
  // only the pod that minted it can sign for.
  VAPID_AUTO_GENERATE: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  // Extra push-service host suffixes to accept on top of
  // `DEFAULT_PUSH_HOST_SUFFIXES` (comma-separated). Only needed for a browser
  // whose push service is not one of the shipped defaults; it does not let a
  // deployment push notifications itself — see the module comment on
  // `services/push/endpointValidation.ts`.
  PUSH_ENDPOINT_ALLOWLIST: z.string().optional(),
});

const parsedEnv = envSchema.parse(process.env);

// See VAPID_AUTO_GENERATE above: only fills the gap when no real keypair was
// provisioned, so an explicitly configured pair always wins. `||`, not `??`
// — an empty-string secret value (e.g. an unset-but-present Kubernetes
// secretKeyRef) must also count as "not configured".
const generatedVapidKeys =
  parsedEnv.VAPID_AUTO_GENERATE &&
  !parsedEnv.VAPID_PUBLIC_KEY &&
  !parsedEnv.VAPID_PRIVATE_KEY
    ? generateVAPIDKeys()
    : undefined;
const vapidPublicKey = parsedEnv.VAPID_PUBLIC_KEY || generatedVapidKeys?.publicKey;
const vapidPrivateKey = parsedEnv.VAPID_PRIVATE_KEY || generatedVapidKeys?.privateKey;

const databaseUrl =
  parsedEnv.DATABASE_URL ??
  (parsedEnv.DB_HOSTNAME &&
  parsedEnv.DB_PORT &&
  parsedEnv.DB_USERNAME &&
  parsedEnv.DB_PASSWORD &&
  parsedEnv.DB_DATABASE_NAME
    ? `postgres://${parsedEnv.DB_USERNAME}:${parsedEnv.DB_PASSWORD}@${parsedEnv.DB_HOSTNAME}:${parsedEnv.DB_PORT}/${parsedEnv.DB_DATABASE_NAME}`
    : 'postgres://postgres:postgres@doschei-postgres.doschei.svc.cluster.local:5432/doschei');

export const env = {
  ...parsedEnv,
  DATABASE_URL: databaseUrl,
  FRONTEND_URL: parsedEnv.FRONTEND_URL ?? parsedEnv.CORS_ORIGIN,
  localLoginEnabled: parsedEnv.AUTH_LOCAL_LOGIN_ENABLED,
  localRegistrationEnabled: parsedEnv.AUTH_LOCAL_REGISTRATION_ENABLED,
  oauthEnabled:
    parsedEnv.OAUTH_CONFIG?.enabled === true &&
    Boolean(parsedEnv.OAUTH_STATE_SECRET),
  VAPID_PUBLIC_KEY: vapidPublicKey,
  VAPID_PRIVATE_KEY: vapidPrivateKey,
  pushEnabled: Boolean(vapidPublicKey && vapidPrivateKey),
  pushEndpointExtraHostSuffixes: (parsedEnv.PUSH_ENDPOINT_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0),
};
