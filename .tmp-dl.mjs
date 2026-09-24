import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
const BASE = 'http://localhost:3005';
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'qa_admin', password: 'QaPass!2026', deviceId: 'dl' }) }).then((r) => r.json());
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await context.addInitScript(({ token, user }) => { localStorage.setItem('pos_token', token); localStorage.setItem('pos_user', JSON.stringify(user)); }, { token: login.token, user: login.user });
const page = await context.newPage();
await page.goto(`${BASE}/${process.argv[2]}`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(3000);
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.getByRole('button', { name: 'Excel', exact: true }).first().click()]);
const path = `test-results/dl-${download.suggestedFilename()}`;
await download.saveAs(path);
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path);
for (const ws of wb.worksheets) {
  const cols = [];
  ws.getRow(4).eachCell((cell, i) => cols.push(`${cell.value}=${Math.round(ws.getColumn(i).width)}`));
  console.log(ws.name.padEnd(20), cols.join(' | '));
}
await browser.close();
