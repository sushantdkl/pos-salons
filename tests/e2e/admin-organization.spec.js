import crypto from 'node:crypto';
import { test, expect } from '@playwright/test';
import pg from 'pg';

process.loadEnvFile('.env.local');

let client;
let token;
let admin;

test.beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await client.connect();
  const result = await client.query("SELECT id,username,full_name,role FROM users WHERE role='admin' AND is_active=TRUE LIMIT 1");
  if (!result.rowCount) throw new Error('An active Admin is required for the admin organization E2E test.');
  admin = result.rows[0];
  token = `admin-organization-e2e-${crypto.randomUUID()}`;
  await client.query("INSERT INTO sessions(user_id,token,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')", [admin.id, token]);
});

test.afterAll(async () => {
  if (client) {
    await client.query('DELETE FROM sessions WHERE token=$1', [token]).catch(() => {});
    await client.end();
  }
});

async function signedInPage(browser, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ sessionToken, user }) => {
    localStorage.setItem('pos_token', sessionToken);
    localStorage.setItem('pos_user', JSON.stringify(user));
  }, { sessionToken: token, user: admin });
  return { context, page: await context.newPage() };
}

test('Admin can find settings, printer, and distinct report destinations', async ({ browser }) => {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const { context, page } = await signedInPage(browser, viewport);
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Configuration Center' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
    await page.screenshot({ path: `test-results/configuration-center-${viewport.name}.png`, fullPage: true });

    await page.goto('/admin/printer');
    await expect(page.getByRole('heading', { name: 'Printer & Documents' })).toBeVisible();
    await expect(page.getByText(/LIVE PREVIEW/i)).toBeVisible();
    await page.screenshot({ path: `test-results/printer-${viewport.name}.png`, fullPage: true });

    await page.goto('/admin/reports/center/payments');
    await expect(page.getByRole('heading', { name: 'Payment Reconciliation' })).toBeVisible();
    if (viewport.name === 'desktop') {
      await expect(page.getByRole('link', { name: 'Sales & Invoices' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Compare report' })).toBeVisible();
    }
    await page.screenshot({ path: `test-results/report-center-${viewport.name}.png`, fullPage: true });
    await context.close();
  }
});
