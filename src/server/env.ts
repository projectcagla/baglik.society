import 'server-only';
import { envSchema, invalidEnvNames, type Env } from './env-schema';

export type { Env };

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = invalidEnvNames().join(', ');
    throw new Error(`Missing or invalid environment variables: ${names}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isProduction = () => process.env.NODE_ENV === 'production';

export const linkCheckEnabled = () => env().LINK_CHECK !== 'off';
