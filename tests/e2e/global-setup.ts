import { execFileSync } from 'node:child_process';
import { e2eEnv } from '../../playwright.config';

export default function globalSetup() {
  // run with the react-server condition so the app's server modules load as in Next
  execFileSync('npx', ['tsx', '--conditions=react-server', 'scripts/e2e-setup.ts'], {
    stdio: 'inherit',
    env: { ...process.env, ...e2eEnv, NODE_ENV: 'test' },
  });
}
