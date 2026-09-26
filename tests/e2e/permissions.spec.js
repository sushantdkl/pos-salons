import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import pg from 'pg';

process.loadEnvFile('.env.local');

let client;
let token;

test.beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await client.connect();
  const admin = await client.query("SELECT id,username,full_name,role FROM users WHERE role='admin' AND is_active=TRUE LIMIT 1");
  if (!admin.rowCount) throw new Error('An active Admin is required for the permissions E2E test.');
  token = `permissions-e2e-${crypto.randomUUID()}`;
  await client.query("INSERT INTO sessions(user_id,token,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')", [admin.rows[0].id, token]);
  globalThis.testAdmin = admin.rows[0];
});

test.afterAll(async () => {
  if (client) {
    await client.query('DELETE FROM sessions WHERE token=$1', [token]).catch(() => {});
    await client.end();
  }
});

test('Admin can inspect responsive salon role permissions and history', async ({ browser }) => {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ sessionToken, admin }) => {
      localStorage.setItem('pos_token', sessionToken);
      localStorage.setItem('pos_user', JSON.stringify(admin));
    }, { sessionToken: token, admin: globalThis.testAdmin });
    const page = await context.newPage();
    await page.goto('/admin/permissions');
    await expect(page.getByRole('heading', { name: 'Staff permissions' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cashier/i })).toBeVisible();
    await expect(page.getByTitle('Mandatory cashier restriction').first()).toBeVisible();
    await page.screenshot({ path: `test-results/permissions-${viewport.name}.png`, fullPage: true });
    await page.getByRole('button', { name: /Change history/i }).click();
    await expect(page.getByRole('heading', { name: 'Permission change history' })).toBeVisible();
    await context.close();
  }
});
