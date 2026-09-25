import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const E2E_DB =
  process.env.E2E_DATABASE_URL ?? 'postgres://baglik:baglik-dev@localhost:5432/baglik_e2e';
const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export const e2eEnv = {
  DATABASE_URL: E2E_DB,
  AUTH_PEPPER: process.env.AUTH_PEPPER ?? 'e2e-pepper-0123456789abcdef0123456789abcdef',
  APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 9).toString('base64'),
  APP_ORIGIN: `http://localhost:${PORT}`,
  CRON_SECRET: 'e2e-cron-secret-0123456789abcdef',
};

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } } },
  ],
  webServer: {
    // production build: exercises the real headers, caching and CSP
    command: process.env.E2E_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: { ...e2eEnv, NODE_ENV: 'production' },
  },
});
