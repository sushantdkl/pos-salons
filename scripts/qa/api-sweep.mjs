/**
 * Calls every GET API route that has no path parameter, as Admin and as Cashier, and flags any
 * server error (5xx). 4xx answers are listed for review (a role without access must get 403).
 *
 *   QA_BASE_URL=http://localhost:3013 node scripts/qa/api-sweep.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const ROOT = path.resolve('src/app/api');

function routes(dir, prefix = '/api') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routes(full, `${prefix}/${entry.name}`));
    else if (/^route\.(js|ts)$/.test(entry.name) && /export\s+(async\s+)?function\s+GET\b/.test(fs.readFileSync(full, 'utf8'))) out.push(prefix);
  }
  return out;
}

async function login(username) {
  const response = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: PASSWORD, deviceId: `sweep-${username}` }) });
  return (await response.json()).token;
}

const all = routes(ROOT).filter((route) => !route.includes('['));
const tokens = { admin: await login('qa_admin'), cashier: await login('qa_cashier') };
const serverErrors = [];
const notes = [];
for (const route of all) {
  for (const [role, token] of Object.entries(tokens)) {
    const response = await fetch(`${BASE}${route}`, { headers: { Authorization: `Bearer ${token}` } });
    let body = '';
    try { body = (await response.text()).slice(0, 140); } catch { /* empty */ }
    if (response.status >= 500) serverErrors.push(`${role.padEnd(8)} ${response.status} ${route}  ${body}`);
    else if (response.status >= 400 && response.status !== 403 && response.status !== 401) notes.push(`${role.padEnd(8)} ${response.status} ${route}  ${body}`);
  }
}
for (const line of notes) console.log(`NOTE  ${line}`);
for (const line of serverErrors) console.log(`FAIL  ${line}`);
console.log(`\n${all.length} GET routes x 2 roles, ${serverErrors.length} server errors`);
process.exit(serverErrors.length ? 1 : 0);
