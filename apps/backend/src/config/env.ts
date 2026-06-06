import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .default('postgres://postgres:postgres@doschei-postgres.doschei.svc.cluster.local:5432/doschei'),
  JWT_SECRET: z.string().default('change-me-in-real-environments'),
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

export const env = envSchema.parse(process.env);
