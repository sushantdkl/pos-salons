/**
 * Loyalty + customer reviews + universal QR regression — real app over HTTP (QA database only).
 *
 *   QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL=<..._qa> node scripts/qa/loyalty-scenario.mjs
 *
 *   A  9 + 1 haircut program: 1/9 … 9/9 → FREE HAIRCUT AVAILABLE
 *   B  wrong service (Trim) never counts
 *   C  duplicate protection (idempotent bill replay, awarding twice)
 *   D  bill #10 with the reward: gross kept, loyalty discount, Rs 0, no payment rows, no cash; next card 0/9
 *   E  void: earned stamp reversed; voiding the reward bill gives the reward back; history kept
 *   F  walk-in claim code: once only, wrong code refused
 *   G  public QR page: safe data only, unknown number reveals nothing
 *   H  reviews: 3★ pending → private → published on website (first name only); 1★ kept; one per visit;
 *      forged visit refused; loyalty unaffected by rating
 *   I  permissions + manual adjustment audit
 *   J  finance: loyalty discount inside discounts, net unchanged maths, drawer untouched
 *   K  rate limiting on phone lookups (last — it blocks this IP for a while)
 */
import { randomUUID, randomInt } from 'node:crypto';
import pg from 'pg';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const DB_URL = process.env.QA_DATABASE_URL;
if (!DB_URL || !new URL(DB_URL).pathname.endsWith('_qa')) throw new Error('QA_DATABASE_URL must point at a *_qa database');

const results = [];
const check = (label, ok, detail = '') => results.push({ ok: Boolean(ok), label, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;

async function call(token, method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let json = {};
  try { json = JSON.parse(raw); } catch { /* not json */ }
  return { status: response.status, json, raw, headers: response.headers };
}
async function must(token, method, path, body, headers) {
  const result = await call(token, method, path, body, headers);
  if (result.status >= 400) throw new Error(`${method} ${path} -> ${result.status}: ${result.json.error}`);
  return result.json;
}
async function login(username) {
  const { json } = await call(null, 'POST', '/api/auth/login', { username, password: PASSWORD });
  if (!json.token) throw new Error(`login failed: ${username}`);
  return json.token;
}

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
await db.query('TRUNCATE loyalty_ledger, loyalty_claim_codes, customer_reviews, crm_audit_log RESTART IDENTITY CASCADE');
await db.query('DELETE FROM loyalty_programs');
await db.query(`UPDATE crm_settings SET public_rewards_enabled = TRUE, public_reviews_enabled = TRUE, general_feedback_enabled = TRUE, claim_codes_enabled = TRUE, website_reviews_enabled = TRUE WHERE id = 1`);

const admin = await login('qa_admin');
const cashier = await login('qa_cashier');
const barberToken = await login('qa_barber');
const services = (await must(admin, 'GET', '/api/admin/services')).services;
const svc = (name) => services.find((service) => service.name === name);
const haircut = svc('QA Haircut');
const trim = svc('QA Trim');
const staff = (await must(cashier, 'GET', '/api/admin/employees')).employees;
const barber = staff.find((member) => member.full_name === 'QA Barber');
const phone = () => `98${String(randomInt(10000000, 99999999))}`;
const phoneA = phone();
const phoneB = phone();

await must(admin, 'POST', '/api/store', { action: 'open', startingCash: 1000 });
const cash = async () => (await must(admin, 'GET', '/api/store')).status.session.expectedCash;
const bill = (body, key = randomUUID()) => call(cashier, 'POST', '/api/admin/billing', body, { 'idempotency-key': key });
const haircutBill = (extra = {}, key = randomUUID()) => bill({ services: [{ id: haircut.id, staff_id: barber.id }], payment_method: 'cash', amount_paid: Number(haircut.price), ...extra }, key);
const card = async (customerId) => (await must(cashier, 'GET', `/api/crm/loyalty/customer?customerId=${customerId}`)).programs.find((p) => p.name === 'QA Haircut Loyalty');

/* ------------------------------------------------------------------ A 9 + 1 */
const program = (await must(admin, 'POST', '/api/crm/loyalty', {
  action: 'program', name: 'QA Haircut Loyalty', eligibleServiceIds: [haircut.id], requiredVisits: 9, rewardType: 'FREE_SERVICE', rewardServiceId: haircut.id,
})).program;
check('A program created: 9 paid → free haircut', program.requiredVisits === 9 && program.rewardLabel === `Free ${haircut.name}`, program);

const first = await haircutBill({ customer_name: 'Sujan Test', customer_phone: phoneA });
check('A haircut bill #1 saved', first.status === 201, first.json.error);
const customerA = first.json.bill.customer_id;
check('A after #1: 1 / 9', (await card(customerA)).progress === 1, await card(customerA));
check('A bill response carries progress for the receipt', first.json.bill.loyalty_progress?.[0]?.progress === 1, first.json.bill.loyalty_progress);
const firstKey = randomUUID();
const bill2 = await haircutBill({ customer_id: customerA, customer_name: 'Sujan Test' });
for (let n = 3; n <= 9; n += 1) await haircutBill({ customer_id: customerA, customer_name: 'Sujan Test' }, n === 9 ? firstKey : randomUUID());
let a = await card(customerA);
check('A after #9: FREE HAIRCUT AVAILABLE', a.available === 1 && a.progress === 0, a);

/* ------------------------------------------------------------------ B wrong service */
await bill({ customer_id: customerA, services: [{ id: trim.id, staff_id: barber.id }], payment_method: 'cash', amount_paid: Number(trim.price) });
a = await card(customerA);
check('B a Trim bill does not count toward haircut loyalty', a.balance === 9, a);

/* ------------------------------------------------------------------ C duplicates */
const replay = await haircutBill({ customer_id: customerA, customer_name: 'Sujan Test' }, firstKey);
check('C replaying a bill (same idempotency key) is not a new bill', replay.json.duplicate === true, replay.status);
const earns = Number((await db.query("SELECT COUNT(*) n FROM loyalty_ledger WHERE customer_id = $1 AND entry_type = 'EARN'", [customerA])).rows[0].n);
check('C exactly 9 EARN entries', earns === 9, earns);
const dupInsert = await db.query(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, source)
  SELECT customer_id, program_id, bill_id, bill_item_id, 'EARN', 1, 'POS' FROM loyalty_ledger WHERE customer_id = $1 AND entry_type = 'EARN' LIMIT 1
  ON CONFLICT DO NOTHING`, [customerA]);
check('C the database refuses a second EARN for the same bill line', dupInsert.rowCount === 0, dupInsert.rowCount);

/* ------------------------------------------------------------------ D redeem */
const noReward = await haircutBill({ customer_id: randomInt(900000, 999999), loyalty_redemption: { programId: program.id } });
check('D redeem without a reward is refused', noReward.status >= 400, noReward.status);
const cashBefore = await cash();
const tenth = await bill({ customer_id: customerA, customer_name: 'Sujan Test', services: [{ id: haircut.id, staff_id: barber.id }], payment_method: 'cash', amount_paid: 0, loyalty_redemption: { programId: program.id } });
check('D bill #10 with reward saved', tenth.status === 201, tenth.json.error);
const t = tenth.json.bill;
check('D gross service value kept', near(t.subtotal, haircut.price), t.subtotal);
check('D loyalty discount = haircut price', near(t.loyalty_discount, haircut.price) && near(t.discount_amount, haircut.price), t);
check('D net payable Rs 0', near(t.grand_total, 0), t.grand_total);
const allocs = Number((await db.query('SELECT COUNT(*) n FROM salon_payment_allocations WHERE bill_id = $1', [t.id])).rows[0].n);
check('D no payment rows for the free service (no fake cash / online)', allocs === 0, allocs);
check('D drawer cash unchanged by the free service', near(await cash(), cashBefore), await cash());
a = await card(customerA);
check('D reward used; next card starts 0 / 9 (free visit does not count)', a.available === 0 && a.progress === 0 && a.redeemed === 1, a);
const reuse = await bill({ customer_id: customerA, services: [{ id: haircut.id, staff_id: barber.id }], payment_method: 'cash', amount_paid: 0, loyalty_redemption: { programId: program.id } });
check('D the same reward cannot be used twice', reuse.status === 409, reuse.json.error);

/* ------------------------------------------------------------------ E void */
await must(admin, 'POST', `/api/admin/billing/${t.id}/corrections`, { reason: 'QA void reward bill' }, { 'idempotency-key': randomUUID() });
a = await card(customerA);
check('E voiding the reward bill gives the reward back', a.available === 1, a);
await must(admin, 'POST', `/api/admin/billing/${bill2.json.bill.id}/corrections`, { reason: 'QA void a paid haircut' }, { 'idempotency-key': randomUUID() });
a = await card(customerA);
check('E voiding a paid haircut removes its stamp (8 / 9)', a.balance === 8 && a.available === 0, a);
const kinds = (await db.query('SELECT entry_type FROM loyalty_ledger WHERE bill_id = $1 ORDER BY id', [bill2.json.bill.id])).rows.map((row) => row.entry_type).join(',');
check('E history kept: EARN then REVERSAL', kinds === 'EARN,REVERSAL', kinds);
const reVoid = (await db.query('SELECT COUNT(*) n FROM loyalty_ledger WHERE bill_id = $1 AND entry_type = \'REVERSAL\'', [t.id])).rows[0].n;
check('E each entry reversed once', Number(reVoid) === 1, reVoid);

/* ------------------------------------------------------------------ F claim code */
const walkIn = await haircutBill({ customer_name: 'Walk-in Customer' });
const code = walkIn.json.bill.loyalty_claim_code;
check('F walk-in haircut bill prints a 6-character claim code', /^[A-Z2-9]{6}$/.test(code || ''), code);
const wrong = await call(null, 'POST', '/api/public/rewards', { action: 'claim', phone: phoneB, code: 'ZZZZZZ' });
check('F wrong code refused', wrong.status === 409, wrong.status);
const claimed = await call(null, 'POST', '/api/public/rewards', { action: 'claim', phone: phoneB, code: code.toLowerCase(), name: 'Asha' });
check('F code attaches the visit: 1 / 9', claimed.status === 200 && claimed.json.programs?.[0]?.progress === 1, claimed.json);
const again = await call(null, 'POST', '/api/public/rewards', { action: 'claim', phone: phoneA, code });
check('F a code works only once', again.status === 409, again.status);

/* ------------------------------------------------------------------ G public page */
const cfg = await call(null, 'GET', '/api/public/rewards');
check('G QR page config needs no login and lists the program', cfg.status === 200 && cfg.json.programs?.some((p) => p.name === 'QA Haircut Loyalty') && cfg.json.form, cfg.json);
const look = await call(null, 'POST', '/api/public/rewards', { action: 'lookup', phone: phoneA });
check('G lookup shows first name and progress', look.json.firstName === 'Sujan' && look.json.programs?.[0]?.progress === 8, look.json);
check('G lookup exposes no phone, bill number, amount or email', !look.raw.includes(phoneA) && !/SALON-|grand_total|amount|email|@/i.test(look.raw), look.raw.slice(0, 300));
const unknown = await call(null, 'POST', '/api/public/rewards', { action: 'lookup', phone: phone() });
check('G an unknown number reveals nothing', unknown.status === 200 && unknown.json.found === false && !unknown.json.firstName, unknown.json);
const scanned = Number((await db.query('SELECT COUNT(*) n FROM loyalty_ledger WHERE customer_id = $1', [customerA])).rows[0].n);
await call(null, 'POST', '/api/public/rewards', { action: 'lookup', phone: phoneA });
check('G scanning / looking up earns nothing', Number((await db.query('SELECT COUNT(*) n FROM loyalty_ledger WHERE customer_id = $1', [customerA])).rows[0].n) === scanned);
const qr = await call(null, 'GET', '/api/public/qr');
check('G universal QR is an SVG pointing at /review with no ids', qr.status === 200 && qr.raw.includes('<svg') && /\/review$/.test(qr.headers.get('x-qr-target') || ''), qr.headers.get('x-qr-target'));

/* ------------------------------------------------------------------ H reviews */
const visitRef = look.json.visits?.[0]?.ref;
check('G/H a recent visit is offered for review', Boolean(visitRef), look.json.visits);
const review = await call(null, 'POST', '/api/public/rewards', { action: 'review', visitRef, rating: 3, text: 'This was okay.', publicConsent: true });
check('H 3★ review saved as PENDING and verified', review.status === 201 && review.json.status === 'PENDING' && review.json.verified === true, review.json);
const dupReview = await call(null, 'POST', '/api/public/rewards', { action: 'review', visitRef, rating: 5, text: 'again' });
check('H the same visit cannot be reviewed twice', dupReview.status === 409 && dupReview.json.code === 'ALREADY_REVIEWED', dupReview.json);
const forged = await call(null, 'POST', '/api/public/rewards', { action: 'review', visitRef: `${visitRef.slice(0, -2)}xx`, rating: 5, text: 'fake' });
check('H a forged visit reference is refused', forged.status === 409, forged.status);
let site = await call(null, 'GET', '/api/public/reviews');
check('H pending review is not on the website', !site.json.reviews.some((r) => r.text === 'This was okay.'));
const reviewId = review.json.id;
await must(admin, 'POST', '/api/crm/reviews', { action: 'moderate', id: reviewId, status: 'PRIVATE' });
site = await call(null, 'GET', '/api/public/reviews');
check('H private review stays off the website', !site.json.reviews.some((r) => r.text === 'This was okay.'));
await must(admin, 'POST', '/api/crm/reviews', { action: 'moderate', id: reviewId, status: 'PUBLISHED' });
site = await call(null, 'GET', '/api/public/reviews');
const shown = site.json.reviews.find((r) => r.text === 'This was okay.');
check('H published review appears with first name only', shown && shown.name === 'Sujan' && shown.rating === 3, shown);
check('H website review carries no phone or surname', !site.raw.includes(phoneA) && !site.raw.includes('Sujan Test'), site.raw.slice(0, 200));
const visits = (await call(null, 'POST', '/api/public/rewards', { action: 'lookup', phone: phoneA })).json.visits;
const low = await call(null, 'POST', '/api/public/rewards', { action: 'review', visitRef: visits[0]?.ref, rating: 1, text: 'Not good.', publicConsent: false });
check('H 1★ feedback saved privately (pending)', low.status === 201 && low.json.status === 'PENDING', low.json);
const noConsent = await call(admin, 'POST', '/api/crm/reviews', { action: 'moderate', id: low.json.id, status: 'PUBLISHED' });
check('H cannot publish without the customer\'s consent', noConsent.status === 409, noConsent.json.error);
check('H loyalty unchanged by any rating (8 / 9)', (await card(customerA)).balance === 8);
const overview = await must(admin, 'GET', '/api/crm/reviews');
check('H low-rating alert raised', overview.lowRatings.some((r) => r.id === low.json.id), overview.lowRatings.map((r) => r.id));
await must(admin, 'POST', '/api/crm/reviews', { action: 'reopen', id: reviewId, reason: 'QA customer asked to update' });
const redo = await call(null, 'POST', '/api/public/rewards', { action: 'review', visitRef, rating: 4, text: 'Better after all.' });
check('H admin re-open allows one new review for that visit', redo.status === 201, redo.json);
const general = await call(null, 'POST', '/api/public/rewards', { action: 'review', rating: 5, text: 'Lovely place', name: 'Ram' });
check('H general feedback (no visit) is saved unverified', general.status === 201 && general.json.verified === false, general.json);

/* ------------------------------------------------------------------ I permissions */
check('I cashier cannot open loyalty admin', (await call(cashier, 'GET', '/api/crm/loyalty')).status === 403);
check('I cashier cannot adjust loyalty', (await call(cashier, 'POST', '/api/crm/loyalty', { action: 'adjust', customerId: customerA, programId: program.id, visits: 5, reason: 'x' })).status === 403);
check('I stylist cannot read reviews', (await call(barberToken, 'GET', '/api/crm/reviews')).status === 403);
check('I CRM admin APIs need login', (await call(null, 'GET', '/api/crm/loyalty')).status === 401);
const noWhy = await call(admin, 'POST', '/api/crm/loyalty', { action: 'adjust', customerId: customerA, programId: program.id, visits: 1 });
check('I manual adjustment needs a reason', noWhy.status === 400, noWhy.json.error);
const adj = await must(admin, 'POST', '/api/crm/loyalty', { action: 'adjust', customerId: customerA, programId: program.id, visits: 1, reason: 'QA missed stamp' });
check('I adjustment records before / after', adj.before === 8 && adj.after === 9, adj);
const audit = (await db.query("SELECT COUNT(*) n FROM crm_audit_log WHERE action = 'manual_adjustment' AND reason = 'QA missed stamp'")).rows[0].n;
check('I adjustment is in the audit log', Number(audit) === 1, audit);

/* ------------------------------------------------------------------ J finance */
const exec = await must(admin, 'GET', '/api/admin/executive-summary?period=today');
const s = exec.summary || exec;
const bills = (await db.query("SELECT COALESCE(SUM(subtotal),0) gross, COALESCE(SUM(discount_amount),0) disc, COALESCE(SUM(loyalty_discount),0) loy, COALESCE(SUM(grand_total),0) net FROM salon_bills WHERE status = 'paid'")).rows[0];
check('J gross − discounts = net holds with loyalty inside discounts', near(Number(bills.gross) - Number(bills.disc), bills.net), bills);
check('J the voided reward bill carries its loyalty discount only on a cancelled bill', Number(bills.loy) === 0, bills.loy);
check('J summary still reconciles', s && Number.isFinite(Number(s.cashPosition?.expectedCash)), s?.cashPosition);

/* ------------------------------------------------------------------ K rate limit */
let limited = false;
for (let n = 0; n < 25 && !limited; n += 1) limited = (await call(null, 'POST', '/api/public/rewards', { action: 'lookup', phone: phone() })).status === 429;
check('K repeated phone lookups are rate-limited', limited);

// L. Join rewards from the QR page: creates an empty card, never a visit, never a duplicate.
{
  const joinPhone = phone();
  const first = await call(null, 'POST', '/api/public/rewards', { action: 'join', phone: joinPhone, name: 'QA Joiner' });
  check('L1 a new number can join rewards from the QR page', first.status === 201 && first.json.card?.found === true, first);
  const created = await db.query('SELECT id, name, notes FROM customers WHERE phone = $1', [joinPhone]);
  check('L2 joining creates the customer with a note', created.rows.length === 1 && /Joined rewards/.test(created.rows[0].notes || ''));
  const earned = await db.query('SELECT COUNT(*)::int AS n FROM loyalty_ledger WHERE customer_id = $1', [created.rows[0]?.id || 0]);
  check('L3 joining never earns a visit', earned.rows[0].n === 0 && (first.json.card?.programs || []).every((program) => program.progress === 0));
  const again = await call(null, 'POST', '/api/public/rewards', { action: 'join', phone: joinPhone, name: 'Someone Else' });
  const after = await db.query('SELECT COUNT(*)::int AS n, MAX(name) AS name FROM customers WHERE phone = $1', [joinPhone]);
  check('L4 joining again neither duplicates nor renames the customer', again.status === 201 && after.rows[0].n === 1 && after.rows[0].name === 'QA Joiner');
  check('L5 join rejects a bad number', (await call(null, 'POST', '/api/public/rewards', { action: 'join', phone: '123', name: 'Bad Number' })).status === 400);
  await db.query('UPDATE crm_settings SET public_join_enabled = FALSE WHERE id = 1');
  check('L6 the owner can switch joining off', (await call(null, 'POST', '/api/public/rewards', { action: 'join', phone: phone(), name: 'Off Switch' })).status === 403);
  await db.query('UPDATE crm_settings SET public_join_enabled = TRUE WHERE id = 1');
}

await db.end();
const failed = results.filter((item) => !item.ok);
for (const item of results) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.label}${item.ok ? '' : `  ${item.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} loyalty & review checks passed`);
process.exit(failed.length ? 1 : 0);
