import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

// The privileged (RLS-bypassing) database context may only be used by the
// audited auth/system modules and CLI scripts. Everything else must go through
// src/server/db/context.ts, which runs as the restricted `baglik_app` role.
const systemDbBoundary = {
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/server/auth/**', 'src/server/system/**', 'src/server/db/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/server/db/system', '**/db/system'],
            message: 'Privileged DB access is limited to src/server/auth and src/server/system.',
          },
        ],
      },
    ],
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  systemDbBoundary,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'scripts/brand/**',
  ]),
]);
