/**
 * Whole-site crawl — every sidebar link of every role, plus detail pages and sub-routes, in a
 * real browser. For each page (and each of its tabs) it records:
 *   - console errors and uncaught page errors
 *   - any /api/ request that fails (4xx / 5xx)
 *   - redirects away from a page the role's own sidebar offers
 *   - error text on screen ("Something went wrong", "Unable to load", "NaN", "undefined", "Invalid Date")
 *
 *   QA_BASE_URL=http://localhost:3013 node scripts/qa/site-crawl.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const ROLES = [
  ['qa_admin', 'admin'], ['qa_cashier', 'cashier'], ['qa_barber', 'barber'],
  ['demo_anita', 'stylist'], ['demo_puja', 'beautician'],
];
const BAD_TEXT = [/Something went wrong/i, /Unable to load/i, /Failed to load/i, /\bNaN\b/, /Rs undefined/, /\bundefined\b/, /Invalid Date/, /This page could not be found/i, /Application error/i];

const failures = [];
let checked = 0;
const fail = (role, path, what) => { failures.push(`${role.padEnd(10)} ${path}  ${what}`); };

async function api(token, path) {
  const response = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD, deviceId: `crawl-${username}` }) });
  const body = await response.json();
  if (!body.token) throw new Error(`Login failed: ${username}`);
  return body;
}

/** Extra routes that the sidebar does not list directly (detail pages, report keys, sub-routes). */
async function extraRoutes(role, token) {
  if (role !== 'admin') return role === 'cashier' ? ['/dashboard/cashier/transactions'] : [];
  const routes = ['/admin/dashboard', '/dashboard/admin/expenses/new', '/dashboard/admin/expenses/reports', '/dashboard/admin/expenses/salary'];
  const catalog = await import('../../src/lib/reports/report-catalog.js').catch(() => null);
  const keys = catalog ? Object.keys(catalog.REPORTS || catalog.REPORT_CATALOG || {}) : [];
  for (const key of keys) routes.push(`/admin/reports/center/${key}`);
  const customers = await api(token, '/api/customers?limit=5');
  const customerId = (customers?.customers || customers?.data || [])[0]?.id;
  if (customerId) routes.push(`/admin/customers/${customerId}`);
  const suppliers = await api(token, '/api/suppliers');
  const supplierId = (suppliers?.suppliers || suppliers?.data || [])[0]?.id;
  if (supplierId) routes.push(`/admin/suppliers/${supplierId}`);
  const staff = await api(token, '/api/users/active');
  const staffId = (staff?.users || staff || []).find?.((user) => ['barber', 'stylist', 'beautician'].includes(user.role))?.id;
  if (staffId) routes.push(`/admin/hrm/attendance/staff/${staffId}`);
  return routes;
}

async function auditPage(page, role, path, { fromNav }) {
  const errors = [];
  const onConsole = (message) => { if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 160)}`); };
  const onPageError = (error) => errors.push(`pageerror: ${error.message.slice(0, 160)}`);
  const onResponse = (response) => {
    const url = response.url();
    if (url.includes('/api/') && response.status() >= 400) errors.push(`api ${response.status()} ${url.replace(BASE, '').slice(0, 120)}`);
  };
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
  const check = async (label) => {
    checked += 1;
    const here = new URL(page.url()).pathname;
    if (fromNav && label === 'load' && here !== path) fail(role, path, `redirected to ${here}`);
    const text = await page.locator('main, body').first().innerText().catch(() => '');
    for (const pattern of BAD_TEXT) {
      const match = text.match(pattern);
      if (match) { const i = text.indexOf(match[0]); fail(role, `${path} [${label}]`, `text "${text.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}"`); }
    }
    for (const error of errors.splice(0)) {
      // Session probes on logout / aborted navigations are browser noise, not app errors.
      if (/ERR_ABORTED|AbortError|signal is aborted/.test(error)) continue;
      fail(role, `${path} [${label}]`, error);
    }
  };
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(400);
    await check('load');
    // Click through the page's own tabs (tablists, section navs, pressed toggles) once each.
    const tabs = page.locator('[role="tablist"] [role="tab"], nav:not([aria-label="Main navigation"]) button, [aria-label="Document type"] button');
    const count = Math.min(await tabs.count(), 14);
    for (let index = 0; index < count; index += 1) {
      const tab = tabs.nth(index);
      if (!(await tab.isVisible().catch(() => false))) continue;
      const name = ((await tab.innerText().catch(() => '')) || `tab ${index}`).trim().split('\n')[0].slice(0, 30);
      await tab.click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(250);
      if (new URL(page.url()).pathname !== path) { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); continue; }
      await check(`tab ${name}`);
    }
  } catch (error) {
    fail(role, path, `navigation error: ${error.message.split('\n')[0]}`);
  } finally {
    page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
  }
}

const browser = await chromium.launch();
for (const [username, role] of ROLES) {
  let session;
  try { session = await login(username); } catch (error) { fail(role, '-', error.message); continue; }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(user));
  }, { token: session.token, user: session.user });
  const page = await context.newPage();
  const home = role === 'admin' ? '/dashboard/admin' : `/dashboard/${role}`;
  await page.goto(`${BASE}${home}`, { waitUntil: 'networkidle' });
  await page.locator('nav[aria-label="Main navigation"] a[href]').first().waitFor({ timeout: 90000 }).catch(() => {});
  // Open every sidebar group, then read every link the role is offered.
  const groups = page.locator('nav[aria-label="Main navigation"] button[aria-expanded="false"]');
  for (let i = await groups.count(); i > 0; i -= 1) { await groups.first().click().catch(() => {}); await page.waitForTimeout(80); }
  const navLinks = [...new Set(await page.locator('nav[aria-label="Main navigation"] a[href]').evaluateAll((links) => links.map((a) => new URL(a.href).pathname)))];
  if (!navLinks.length) fail(role, home, 'sidebar has no links');
  const extra = await extraRoutes(role, session.token);
  console.log(`${role}: ${navLinks.length} sidebar links + ${extra.length} extra routes`);
  for (const path of navLinks) await auditPage(page, role, path, { fromNav: true });
  for (const path of extra) await auditPage(page, role, path, { fromNav: false });
  await context.close();
}
await browser.close();

for (const line of failures) console.log(`FAIL  ${line}`);
console.log(`\n${checked} page/tab views checked, ${failures.length} problems`);
process.exit(failures.length ? 1 : 0);
