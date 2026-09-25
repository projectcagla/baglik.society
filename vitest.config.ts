import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://baglik:baglik-dev@localhost:5432/baglik_test';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next.js strips this guard in server bundles; tests run server code directly
      'server-only': fileURLToPath(new URL('./tests/support/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globalSetup: ['tests/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      TEST_DATABASE_URL: TEST_DB,
      AUTH_PEPPER: 'test-pepper-0123456789abcdef0123456789abcdef',
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      APP_ORIGIN: 'http://localhost:3000',
    },
  },
});
