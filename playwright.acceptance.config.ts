import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Staging acceptance against a deployed URL (see docs/PRODUCTION_RUNBOOK.md).
//   ACCEPTANCE_CONFIRM=staging STAGING_URL=https://… SETUP_TOKEN=… \
//     npx playwright test -c playwright.acceptance.config.ts
// No traces, videos or failure screenshots: the flow handles one-time codes.
const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'tests/acceptance',
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.STAGING_URL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    timezoneId: 'America/Los_Angeles',
    launchOptions: { executablePath },
  },
});
