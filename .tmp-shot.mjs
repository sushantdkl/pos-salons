import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3005';
const width = Number(process.env.W || 1440);
const role = process.env.ROLE || 'admin';
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `qa_${role}`, password: 'QaPass!2026', deviceId: `shot-${role}` }) }).then((r) => r.json());
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: 900 } });
await context.addInitScript(({ token, user }) => { localStorage.setItem('pos_token', token); localStorage.setItem('pos_user', JSON.stringify(user)); }, { token: login.token, user: login.user });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
for (const arg of process.argv.slice(2)) {
  const [route, name, ...clicks] = arg.split('|');
  await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1500);
  for (const c of clicks) { await page.getByRole('tab', { name: c, exact: true }).click(); await page.waitForTimeout(2500); }
  await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  console.log('shot', name, 'overflow', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
}
console.log('errors', errors);
await browser.close();
