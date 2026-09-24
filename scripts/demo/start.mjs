/**
 * Run the app on http://localhost:3005 against the LOCAL demo database (<db>_demo).
 * Its own build folder (.next-demo), so your normal `npm run dev` is not disturbed.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
const source = new URL(/^DATABASE_URL=(.*)$/m.exec(env)[1].trim());
if (!['localhost', '127.0.0.1', '::1'].includes(source.hostname)) throw new Error('Demo runs on local databases only.');
source.pathname = `${source.pathname}_demo`;
console.log(`Demo: http://localhost:3005  (database ${source.pathname.slice(1)}; logins qa_admin / qa_cashier / qa_barber, password QaPass!2026)`);
const child = spawn('npx', ['next', 'dev', '-p', '3005'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: source.toString(), PG_SSL: 'false', NEXT_DIST_DIR: '.next-demo' },
});
child.on('exit', (code) => process.exit(code ?? 0));
