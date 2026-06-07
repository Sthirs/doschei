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
  SEED_ON_STARTUP: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
  CORS_ORIGIN: z.string().default('http://doschei.127.0.0.1.nip.io'),
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
};
