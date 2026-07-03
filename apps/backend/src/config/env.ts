import dotenv from 'dotenv';
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
});

const parsedEnv = envSchema.parse(process.env);

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
};
