import 'server-only';
import { z } from 'zod';

const schema = z.object({
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
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${names}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === 'production';

export const linkCheckEnabled = () => env().LINK_CHECK !== 'off';
