import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { e2eEnv } from '../../playwright.config';

export type Who = 'owner' | 'admin' | 'editor' | 'member' | 'outsider';

export function state(): Record<Who, { id: string; key: string; name: string; totp?: string }> {
  return JSON.parse(readFileSync('artifacts/e2e-state.json', 'utf8'));
}

export async function login(page: Page, code: string) {
  await page.goto('/');
  await page.getByLabel('giriş kodu').fill(code);
  await page.getByRole('button', { name: 'giriş', exact: true }).click();
  await page.waitForURL((u) => u.pathname !== '/');
}

export async function loginAs(page: Page, who: Who) {
  await login(page, state()[who].key);
  await expect(page).toHaveURL(/\/oda$/);
}

/** Direct DB access for arranging scenarios (plays the admin's hand). */
export async function db<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(e2eEnv.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}
