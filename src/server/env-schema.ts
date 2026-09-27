import { z } from 'zod';

// The environment contract, kept free of `server-only` so the boot step
// (src/instrumentation.ts) can check it before the first request.
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  /** 32+ random bytes, base64/hex. Peppers access-code hashes and IP buckets. */
  AUTH_PEPPER: z.string().min(32),
  /** 32 random bytes, base64. Encrypts TOTP secrets at rest (AES-256-GCM). */
  APP_ENCRYPTION_KEY: z.string().min(40),
  APP_ORIGIN: z.string().url().optional(),
  DB_PREPARE: z.enum(['true', 'false']).optional(),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  CRON_SECRET: z.string().min(24).optional(),
  /**
   * One-time browser setup of the first owner (/kurulum). 32+ random chars.
   * Only works while no owner exists; remove it after setup. A shorter value
   * keeps setup closed (it must never take the whole app down).
   */
  SETUP_TOKEN: z.string().optional(),
  /** "off" keeps the link checker from making any outbound request (see ARCHITECTURE). */
  LINK_CHECK: z.enum(['on', 'off']).optional(),
  /** "1": apply migrations and seed at server start (self-hosted, see docs/CPANEL_KURULUM.md). */
  MIGRATE_ON_BOOT: z.enum(['0', '1']).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

/** Names (never values) of variables that are missing or invalid. */
export function invalidEnvNames(source: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = envSchema.safeParse(source);
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
}
