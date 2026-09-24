process.loadEnvFile('.env.local');
const { Client } = require('pg');
const u = new URL(process.env.DATABASE_URL);
const suffix = process.argv[2] || '';
u.pathname += suffix;
const c = new Client({ connectionString: u.toString() });
c.connect().then(async () => { for (const q of process.argv.slice(3)) { try { console.log(JSON.stringify((await c.query(q)).rows)); } catch (e) { console.log(e.message); } } await c.end(); });
