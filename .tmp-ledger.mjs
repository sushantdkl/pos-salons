import { chromium } from 'playwright';
const BASE = 'http://localhost:3005';
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'qa_admin', password: 'QaPass!2026', deviceId: 'led' }) }).then((r) => r.json());
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(({ token, user }) => { localStorage.setItem('pos_token', token); localStorage.setItem('pos_user', JSON.stringify(user)); }, { token: login.token, user: login.user });
const page = await context.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
for (const [route, name] of [['admin/customer-ledger', 'cl'], ['admin/supplier-ledger', 'sl']]) {
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `test-results/${name}-page.png`, fullPage: true });
  await page.locator('main ul li button').first().click();
  await page.getByText('Total still owed').waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/${name}-modal.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'This Month' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('tab', { name: 'History' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/${name}-history.png`, fullPage: true });
}
console.log('errors', errors);
await browser.close();
