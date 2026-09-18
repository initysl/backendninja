import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // The upload is untrusted input, so every limit is configurable rather than hardcoded.
  IMPORT_MAX_FILE_BYTES: z.coerce.number().int().positive().default(10_485_760),
  IMPORT_MAX_ROWS: z.coerce.number().int().positive().default(100_000),
  IMPORT_MAX_RECORD_BYTES: z.coerce.number().int().positive().default(65_536),
  IMPORT_REPORT_TTL_SECONDS: z.coerce.number().int().positive().default(3_600),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail at boot, not on the first request that needs the value. console, not
  // the logger, because the logger's level comes from here.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
