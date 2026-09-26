const fs = require('fs'); const f = 'tests/unit/documents.test.js'; let s = fs.readFileSync(f, 'utf8');
const reps = [
  ['assert.match(html, /YOUR BUSINESS. OUR BILLING./);', 'assert.match(html, /YOUR BUSINESS\. OUR BILLING\./);'],
  ['assert.match(html, /Restaurant • Retail | <strong>AADHAR POS/);', 'assert.match(html, /Restaurant • Retail \| <strong>AADHAR POS/);'],
  ['assert.match(html, /Billing for your business\?/);', 'assert.match(html, /Restaurant • Retail • Salon • Cosmetics \| <strong>AADHAR POS/);'],
];
for (const [a, b] of reps) { if (!s.includes(a)) throw new Error('missing ' + a); s = s.replace(a, b); }
fs.writeFileSync(f, s);
