import { chromium } from 'playwright';
const BASE = 'http://localhost:3005';
const role = process.env.ROLE || 'admin';
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: `qa_${role}`, password: 'QaPass!2026', deviceId: `el-${role}` }) }).then((r) => r.json());
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(process.env.W || 1440), height: 900 } });
await context.addInitScript(({ token, user }) => { localStorage.setItem('pos_token', token); localStorage.setItem('pos_user', JSON.stringify(user)); }, { token: login.token, user: login.user });
const page = await context.newPage();
const [route, name, ...clicks] = process.argv[2].split('|');
await page.goto(`${BASE}/${route}`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1500);
for (const c of clicks) { await page.getByRole('tab', { name: c, exact: true }).click(); await page.waitForTimeout(3000); }
const el = page.locator('section:has(> div > h2:text-is("Cash Position"))').first();
await el.screenshot({ path: `test-results/${name}.png` });
console.log('ok', name);
await browser.close();
