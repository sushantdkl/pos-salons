/**
 * Responsive + runtime audit of the ERP pages in a real browser.
 *
 *   QA_BASE_URL=http://localhost:3013 QA_SHOTS=<dir> node scripts/qa/responsive-audit.mjs
 *
 * For each role / page / viewport width it checks:
 *   - no page-level horizontal overflow (wide tables must scroll inside their container)
 *   - no console errors (hydration mismatches surface here) and no uncaught page errors
 *   - no "NaN" / "undefined" / "Rs NaN" text rendered
 *   - the sidebar: groups render, the active page's group is open, one active link
 * Screenshots are written to QA_SHOTS for visual review.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const SHOTS = process.env.QA_SHOTS || '';
const WIDTHS = [360, 390, 430, 768, 1024, 1280, 1440];
const SHOT_WIDTHS = new Set([390, 1280]);

const PAGES = {
  admin: [
    '/dashboard/admin',
    '/admin/analytics',
    '/admin/executive-summary',
    '/store/opening-closing',
    '/dashboard/admin/business-days',
    '/admin/billing',
    '/dashboard/admin/tokens',
    '/admin/reports',
    '/admin/reports/center/sales',
    '/admin/reports/center/services',
    '/admin/reports/center/products',
    '/admin/reports/center/payments',
    '/admin/reports/center/credit',
    '/admin/reports/center/expenses',
    '/admin/reports/center/advances',
    '/admin/reports/transactions',
    '/admin/appointments',
    '/admin/appointments/settings',
    '/admin/suppliers',
    '/admin/supplier-ledger',
    '/admin/customer-ledger',
    '/admin/reminders',
    '/admin/purchases',
    '/admin/purchases/new',
    '/admin/hrm/attendance',
    '/admin/hrm/shifts',
    '/admin/hrm/leave',
    '/admin/hrm/overtime',
    '/admin/hrm/reports',
    '/admin/hrm/rules',
    '/admin/crm/loyalty',
    '/admin/crm/reviews',
    '/admin/crm/reviews/forms',
    '/dashboard/admin/expenses/salary',
  ],
  cashier: [
    '/dashboard/cashier',
    '/cashier/executive-summary',
    '/store/opening-closing',
    '/admin/billing',
    '/dashboard/cashier/tokens',
    '/admin/appointments',
    '/dashboard/cashier/daily-expenses',
    '/cashier/credit',
    '/admin/customer-ledger',
    '/admin/reminders',
    '/cashier/advances',
    '/attendance/my',
  ],
  barber: [
    '/dashboard/barber',
    '/appointments/my',
    '/attendance/my',
  ],
};

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASSWORD, deviceId: `ui-${username}` }),
  });
  const json = await response.json();
  if (!json.token) throw new Error(`login failed for ${username}`);
  return json;
}

const results = [];
const record = (label, ok, detail = '') => results.push({ ok, label, detail });

// Profile pages need a real id: use (or create) one supplier and one customer in the QA database.
{
  const { token } = await login('qa_admin');
  const api = (method, route, body) => fetch(`${BASE}${route}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined,
  }).then((response) => response.json());
  let supplier = (await api('GET', '/api/suppliers?all=1')).suppliers?.[0];
  if (!supplier) supplier = (await api('POST', '/api/suppliers', { name: 'QA UI Supplier', openingBalance: 1500 })).supplier;
  let customer = (await api('GET', '/api/admin/customers')).customers?.[0];
  if (!customer) customer = (await api('POST', '/api/admin/customers', { name: 'QA UI Customer' })).customer;
  if (supplier?.id) PAGES.admin.push(`/admin/suppliers/${supplier.id}`);
  const employee = (await api('GET', '/api/hrm/shifts')).employees?.[0];
  if (employee?.id) PAGES.admin.push(`/admin/hrm/attendance/staff/${employee.id}`);
  if (customer?.id) {
    PAGES.admin.push(`/admin/customers/${customer.id}`);
    PAGES.cashier.push(`/admin/customers/${customer.id}`);
  }
}

if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();

for (const [role, pages] of Object.entries(PAGES)) {
  const session = await login(`qa_${role}`);
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('pos_token', token);
      localStorage.setItem('pos_user', JSON.stringify(user));
    }, { token: session.token, user: session.user });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of (401|403|409)/i.test(message.text())) {
        errors.push(message.text().slice(0, 200));
      }
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.slice(0, 200)}`));

    for (const route of pages) {
      errors.length = 0;
      const label = `${role} ${route} @${width}`;
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(600);
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          text: document.body.innerText,
          path: location.pathname,
        }));
        record(`${label} stays on page`, metrics.path === route, `landed on ${metrics.path}`);
        record(`${label} no horizontal overflow`, metrics.scrollWidth <= metrics.clientWidth + 1, `scroll ${metrics.scrollWidth} > client ${metrics.clientWidth}`);
        const bad = metrics.text.match(/\bNaN\b|\bundefined\b|Rs NaN|\[object Object\]/);
        record(`${label} no NaN/undefined text`, !bad, bad ? `found "${bad[0]}"` : '');
        record(`${label} no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

        if (width >= 1024) {
          const nav = await page.evaluate(() => {
            const active = [...document.querySelectorAll('nav[aria-label="Main navigation"] a[aria-current="page"]')].map((a) => a.textContent.trim());
            const groups = document.querySelectorAll('nav[aria-label="Main navigation"] button[aria-expanded]').length;
            return { active, groups };
          });
          record(`${label} one active nav link`, nav.active.length === 1, `active: ${nav.active.join(', ') || 'none'}`);
        }
        if (SHOTS && SHOT_WIDTHS.has(width)) {
          const file = `${role}${route.replaceAll('/', '_')}_${width}.png`;
          await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
        }
      } catch (error) {
        record(`${label} loads`, false, error.message.slice(0, 160));
      }
    }

    // Mobile drawer: opens, closes with Escape.
    if (width < 1024) {
      // One flaky navigation must fail one check, not abort the whole audit.
      try {
        await page.goto(`${BASE}${pages[0]}`, { waitUntil: 'networkidle', timeout: 90000 });
        const menu = page.getByRole('button', { name: 'Open menu' });
        await menu.click();
        const visible = await page.locator('nav[aria-label="Main navigation"]').isVisible();
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const inert = await page.locator('aside').getAttribute('aria-hidden');
        record(`${role} @${width} mobile drawer opens and Escape closes`, visible && inert === 'true', `visible=${visible} aria-hidden=${inert}`);
      } catch (error) {
        record(`${role} @${width} mobile drawer check`, false, error.message.slice(0, 160));
      }
    }
    await context.close();
  }
}

// Keyboard: a nav group toggles with Enter, and the sidebar collapses to an icon rail with tooltips.
{
  const session = await login('qa_admin');
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('pos_token', token);
    localStorage.setItem('pos_user', JSON.stringify(user));
    localStorage.removeItem('salon_pos_nav_groups');
    localStorage.removeItem('admin_sidebar_collapsed');
  }, { token: session.token, user: session.user });
  const page = await context.newPage();
  await page.goto(`${BASE}/admin/analytics`, { waitUntil: 'networkidle' });
  const hrm = page.getByRole('button', { name: /HRM/ });
  await hrm.focus();
  await page.keyboard.press('Enter');
  const expanded = await hrm.getAttribute('aria-expanded');
  record('keyboard Enter expands a nav group', expanded === 'true', `aria-expanded=${expanded}`);
  await page.keyboard.press('Enter');
  record('keyboard Enter collapses it again', (await hrm.getAttribute('aria-expanded')) === 'false');
  await page.goto(`${BASE}/dashboard/admin/expenses/salary`, { waitUntil: 'networkidle' });
  const nested = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Main navigation"] a[aria-current="page"]')].map((a) => a.textContent.trim()));
  record('nested route highlights its own link (Salary & Payroll)', nested.length === 1 && nested[0] === 'Salary & Payroll', nested.join(','));
  record('nested route opens its parent group', (await page.getByRole('button', { name: /HRM/ }).getAttribute('aria-expanded')) === 'true');
  await page.getByRole('button', { name: 'Collapse menu' }).click();
  const tooltip = await page.locator('nav[aria-label="Main navigation"] a[title="Analytics"]').count();
  record('collapsed rail shows tooltips', tooltip === 1, `links with title=Analytics: ${tooltip}`);
  await context.close();
}

// Pages WITH data: the scenario's bills are timestamped today; Last 7 Days covers them.
{
  const session = await login('qa_admin');
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('pos_token', token);
      localStorage.setItem('pos_user', JSON.stringify(user));
    }, { token: session.token, user: session.user });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.slice(0, 200)}`));

    for (const route of ['/admin/executive-summary?period=7days', '/admin/analytics?period=7days']) {
      errors.length = 0;
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForTimeout(800);
      const text = await page.evaluate(() => document.body.innerText);
      record(`${route} @${width} shows the scenario's data`, /9,200\.00/.test(text), 'expected Rs 9,200.00 net sales');
      if (route.includes('analytics')) {
        for (const tab of ['Overview', 'Sales & Money', 'Services', 'Customers', 'Staff', 'Products & Inventory', 'Tokens / Front Desk', 'Appointments', 'Controls & Activity']) {
          errors.length = 0;
          await page.getByRole('tab', { name: tab, exact: true }).click();
          await page.waitForTimeout(500);
          const metrics = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            text: document.body.innerText,
          }));
          record(`analytics tab ${tab} @${width} no overflow`, metrics.scrollWidth <= metrics.clientWidth + 1, `${metrics.scrollWidth}>${metrics.clientWidth}`);
          const bad = metrics.text.match(/\bNaN\b|\bundefined\b|\[object Object\]/);
          record(`analytics tab ${tab} @${width} clean text`, !bad, bad?.[0] || '');
          record(`analytics tab ${tab} @${width} no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
          if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `data_analytics_${tab.replace(/[^a-z]+/gi, '-')}_${width}.png`), fullPage: true });
        }
      } else {
        record(`${route} @${width} no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `data_summary_${width}.png`), fullPage: true });
      }
    }
    await context.close();
  }
}

// Public website booking page (no sidebar) at every width.
for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)));
  await page.goto(`${BASE}/book-appointment`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(800);
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, text: document.body.innerText }));
  record(`public /book-appointment @${width} no overflow`, metrics.scrollWidth <= metrics.clientWidth + 1, `${metrics.scrollWidth}>${metrics.clientWidth}`);
  record(`public /book-appointment @${width} online booking form`, /online booking/i.test(metrics.text) && /services/i.test(metrics.text), metrics.text.slice(0, 80));
  record(`public /book-appointment @${width} no page errors`, errors.length === 0, errors.join(' | '));
  if (SHOTS && SHOT_WIDTHS.has(width)) await page.screenshot({ path: path.join(SHOTS, `public_book-appointment_${width}.png`), fullPage: true });
  await context.close();
}

// Review & Rewards (the permanent QR page): phone widths matter most — no login, no admin nav, no leaks.
for (const width of [320, 360, 390, 430, 768]) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 200)));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon/i.test(message.text())) errors.push(message.text().slice(0, 200)); });
  await page.goto(`${BASE}/review`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, text: document.body.innerText,
    adminNav: Boolean(document.querySelector('nav[aria-label="Main navigation"]')),
  }));
  record(`public /review @${width} no overflow`, metrics.scrollWidth <= metrics.clientWidth + 1, `${metrics.scrollWidth}>${metrics.clientWidth}`);
  record(`public /review @${width} shows review & rewards`, /how was your visit/i.test(metrics.text) && /mobile number/i.test(metrics.text), metrics.text.slice(0, 120));
  record(`public /review @${width} no admin navigation`, !metrics.adminNav);
  record(`public /review @${width} no NaN/undefined`, !/\bNaN\b|\bundefined\b/.test(metrics.text));
  record(`public /review @${width} no page errors`, errors.length === 0, errors.join(' | '));
  if (SHOTS && [320, 390].includes(width)) await page.screenshot({ path: path.join(SHOTS, `public_review_${width}.png`), fullPage: true });
  await context.close();
}

await browser.close();
const failed = results.filter((row) => !row.ok);
for (const row of failed) console.log(`FAIL  ${row.label}  ${row.detail}`);
console.log(`\n${results.length - failed.length}/${results.length} UI checks passed`);
process.exit(failed.length ? 1 : 0);
