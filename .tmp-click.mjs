import { chromium } from 'playwright';
const BASE = 'http://localhost:3005';
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'qa_admin', password: 'QaPass!2026', deviceId: 'click' }) }).then((r) => r.json());
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(({ token, user }) => { localStorage.setItem('pos_token', token); localStorage.setItem('pos_user', JSON.stringify(user)); }, { token: login.token, user: login.user });
const page = await context.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const cases = [
  ['admin/reports/center/sales', 'tbody tr >> nth=0 >> td >> nth=0', null],
  ['admin/reports/center/payments', 'tbody tr:has-text("SALON-") >> nth=0 >> td >> nth=0', null],
  ['admin/reports/transactions?period=today', 'tbody tr:has-text("SALON-") >> nth=0 >> td >> nth=0', null],
  ['admin/reports?period=today', 'tbody tr:has-text("SALON-") >> nth=0 >> td >> nth=0', null],
  ['dashboard/admin', 'tbody tr:has-text("SALON-") >> nth=0 >> td >> nth=2', null],
  ['admin/analytics', 'tbody tr:has-text("SALON-") >> nth=0 >> td >> nth=0', 'Sales & Money'],
];
for (const [route, selector, tab] of cases) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2000);
  if (tab) { await page.getByRole('tab', { name: tab, exact: true }).click(); await page.waitForTimeout(1500); }
  await page.locator(selector).click();
  await page.waitForTimeout(2000);
  const drawer = await page.locator('[role="dialog"]').count();
  const text = drawer ? (await page.locator('[role="dialog"]').first().innerText()).slice(0, 60).replace(/\n/g, ' ') : '';
  console.log(route.padEnd(42), drawer ? 'OPENED' : 'NOT OPENED', text);
}
console.log('errors', errors);
await browser.close();
