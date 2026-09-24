import { chromium } from 'playwright';
const BASE = 'http://localhost:3005';
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'qa_admin', password: 'QaPass!2026', deviceId: 'c2' }) }).then((r) => r.json());
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ token, user }) => { localStorage.setItem('pos_token', token); localStorage.setItem('pos_user', JSON.stringify(user)); }, { token: login.token, user: login.user });
const page = await context.newPage();
for (const label of ['Opening cash', 'Loyalty rewards', 'Savings & deposits', 'Purchases']) {
  await page.goto(`${BASE}/admin/analytics`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.getByRole('tab', { name: 'Last 7 Days', exact: true }).click();
  await page.waitForTimeout(2500);
  await page.getByLabel(`${label} — open details`).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/admin/analytics'), { timeout: 60000 }).catch(() => {});
  const tab = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts();
  console.log(label.padEnd(20), '→', page.url().replace(BASE, ''), '| selected tabs:', tab.join(', ').replace(/\n/g, ' ').slice(0, 60));
}
await browser.close();
