/**
 * DEMO DATA — a realistic, internally consistent salon history for testing every feature.
 *
 *   DATABASE_URL=<..._qa or ..._demo> DAYS=60 node scripts/demo/seed-demo.mjs
 *
 * Run AFTER scripts/qa/seed-qa.mjs (which empties the transactional tables). Refuses to touch
 * any database whose name does not end in _qa or _demo — never point it at the live salon.
 *
 * For each past day it writes what the app itself would have written: one CLOSED business day
 * and store session, walk-in tokens, bills (services, products, discounts, cash / online / split
 * / credit), voids with refunds, credit collections, expenses, savings, loyalty stamps and
 * rewards, reviews, appointments, HR attendance and overtime; plus suppliers & purchases and last
 * month's payroll. Closed sessions store the same expected-cash maths as computeExpectedCash.
 * Today is left with NO open store so live flows (and the QA scenarios) can run on top.
 * Deterministic: the same DAYS gives the same data.
 */
import pg from 'pg';
import { computeAttendance, nepalInstant, shiftWindow, addDays, weekdayOf } from '../../src/lib/hrm/calc.js';

const url = process.env.DATABASE_URL || '';
const dbName = new URL(url).pathname.slice(1);
const dbHost = new URL(url).hostname;
// Demo data is for THIS computer only: a local server and a *_qa / *_demo database. Never production.
if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) throw new Error(`Refusing to seed a non-local database host "${dbHost}". Demo data is localhost-only.`);
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed with NODE_ENV=production.');
if (!/_(qa|demo)$/.test(dbName)) throw new Error(`Refusing to seed "${dbName}": only *_qa or *_demo databases.`);
const DAYS = Math.min(Math.max(Number(process.env.DAYS || 60), 7), 180);

/* ---------------------------------------------------------------- deterministic random */
let seed = 20260924;
const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;
const weighted = (entries) => { const total = entries.reduce((s, [, w]) => s + w, 0); let r = rand() * total; for (const [v, w] of entries) { if ((r -= w) <= 0) return v; } return entries[0][0]; };
const round2 = (v) => Math.round(v * 100) / 100;

const db = new pg.Client({ connectionString: url });
await db.connect();
const q = (sql, params = []) => db.query(sql, params).catch((error) => {
  error.message = `${error.message} — in: ${sql.replace(/\s+/g, ' ').slice(0, 160)}`;
  throw error;
});
const one = async (sql, params = []) => (await q(sql, params)).rows[0];
const all = async (sql, params = []) => (await q(sql, params)).rows;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const firstDay = addDays(today, -DAYS);
const at = (date, hhmm) => nepalInstant(date, hhmm);
const clock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

await q('BEGIN');
try {
  /* ------------------------------------------------------------- reference data */
  const adminId = (await one("SELECT id FROM users WHERE username = 'qa_admin'")).id;
  const cashierId = (await one("SELECT id FROM users WHERE username = 'qa_cashier'")).id;
  const hash = (await one("SELECT password_hash FROM users WHERE username = 'qa_barber'")).password_hash;
  const demoStaff = [
    ['demo_ramesh', 'Ramesh Thapa', 'barber', 12, 22000], ['demo_suraj', 'Suraj Gurung', 'barber', 12, 20000],
    ['demo_anita', 'Anita Shrestha', 'stylist', 15, 24000], ['demo_puja', 'Puja Karki', 'beautician', 15, 21000],
  ];
  for (const [username, fullName, role, commission, salary] of demoStaff) {
    const existing = await one('SELECT id FROM users WHERE username = $1', [username]);
    const id = existing?.id || (await one('INSERT INTO users(username, password_hash, full_name, role, is_active) VALUES ($1,$2,$3,$4,TRUE) RETURNING id', [username, hash, fullName, role])).id;
    await q(`INSERT INTO staff_profiles(user_id, display_name, salon_role, commission_percentage, base_salary) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id) DO UPDATE SET salon_role = EXCLUDED.salon_role, commission_percentage = EXCLUDED.commission_percentage, base_salary = EXCLUDED.base_salary`, [id, fullName, role, commission, salary]);
  }
  await q("UPDATE staff_profiles SET base_salary = 18000, commission_percentage = 10 WHERE user_id = (SELECT id FROM users WHERE username = 'qa_barber')");
  const staff = await all(`SELECT u.id, COALESCE(sp.display_name, u.full_name) AS name, sp.salon_role AS role, COALESCE(sp.commission_percentage, 0) AS pct, COALESCE(sp.base_salary, 0) AS salary
    FROM users u JOIN staff_profiles sp ON sp.user_id = u.id WHERE u.is_active AND sp.salon_role IN ('barber','stylist','beautician') ORDER BY u.id`);
  const services = await all("SELECT id, name, category, price::float AS price, duration_minutes FROM salon_services WHERE is_active AND price > 0 ORDER BY id");
  const products = await all("SELECT id, name, selling_price::float AS price, purchase_price::float AS cost, current_stock FROM salon_products WHERE status = 'active' ORDER BY id");
  const byCategory = (category) => services.filter((s) => s.category === category);
  const haircuts = byCategory('Haircut').length ? byCategory('Haircut') : services.slice(0, 2);
  const staffFor = (service) => {
    const pool = ['Facial', 'Makeup'].includes(service.category) ? staff.filter((s) => s.role === 'beautician')
      : ['Haircut', 'Beard'].includes(service.category) ? staff.filter((s) => s.role === 'barber' || s.role === 'stylist') : staff;
    return pick(pool.length ? pool : staff);
  };

  /* ------------------------------------------------------------- customers */
  const first = ['Aarav', 'Sujan', 'Bikash', 'Rohan', 'Nabin', 'Prakash', 'Kiran', 'Suman', 'Dipesh', 'Anil', 'Manish', 'Rajan', 'Sagar', 'Bishal', 'Prem', 'Hari', 'Ramesh', 'Santosh', 'Deepak', 'Nirajan',
    'Sita', 'Gita', 'Anita', 'Puja', 'Nisha', 'Sarita', 'Kabita', 'Asmita', 'Rina', 'Srijana', 'Mina', 'Laxmi', 'Sabina', 'Pratima', 'Binita'];
  const last = ['Thapa', 'Shrestha', 'Gurung', 'Karki', 'Adhikari', 'Rai', 'Tamang', 'Magar', 'Bhandari', 'KC', 'Basnet', 'Poudel', 'Khadka', 'Oli', 'Rana', 'Lama', 'Joshi', 'Pandey'];
  const customers = [];
  for (let i = 0; i < 160; i += 1) {
    const name = `${pick(first)} ${pick(last)}`;
    const phone = `98${String(10000000 + ((i * 7919 + 13) % 89999999)).padStart(8, '0')}`;
    const row = await one(`INSERT INTO customers(name, phone, credit_limit, created_at) VALUES ($1,$2,$3,$4)
      ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [name, phone, chance(0.25) ? 5000 : 0, at(addDays(firstDay, -between(0, 120)), '11:00')]);
    customers.push({ id: row.id, name, phone, creditLimit: 0, credit: 0, loyalty: 0, visits: 0, spent: 0 });
  }
  await q('UPDATE customers SET credit_limit = 5000 WHERE id = ANY($1)', [customers.filter((_, i) => i % 4 === 0).map((c) => c.id)]);
  customers.forEach((c, i) => { c.creditLimit = i % 4 === 0 ? 5000 : 0; });
  const regulars = customers.slice(0, 50); // come back often — they build loyalty cards

  /* ------------------------------------------------------------- loyalty, reviews, suppliers, HR setup */
  await q('DELETE FROM loyalty_programs');
  const rewardService = haircuts.slice().sort((a, b) => a.price - b.price)[0];
  const program = await one(`INSERT INTO loyalty_programs(name, eligible_categories, required_visits, reward_type, reward_service_id, reward_label, start_date, created_by)
    VALUES ('Haircut Loyalty', '{Haircut}', 9, 'FREE_SERVICE', $1, $2, $3, $4) RETURNING id`, [rewardService.id, `Free ${rewardService.name}`, firstDay, adminId]);
  await q("UPDATE crm_settings SET public_rewards_enabled = TRUE, public_reviews_enabled = TRUE, qr_footer = '9 Haircuts + 1 FREE' WHERE id = 1");
  const form = await one('SELECT id FROM feedback_forms WHERE is_default LIMIT 1');

  const suppliers = [];
  for (const [name, contact, opening] of [['Himalayan Beauty Traders', 'Kamal Joshi', 4500], ['Kathmandu Salon Supplies', 'Binod Rai', 0], ['Glow Cosmetics Pvt Ltd', 'Asha Pandey', 1200]]) {
    const row = await one(`INSERT INTO suppliers(name, contact_person, phone, opening_balance, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [name, contact, `98${between(10000000, 99999999)}`, opening, adminId, at(firstDay, '10:00')]);
    suppliers.push({ id: row.id, name, owed: opening });
  }

  const dayShift = await one(`INSERT INTO hr_shifts(name, start_time, end_time, grace_minutes, break_minutes, working_days, effective_from, created_by)
    VALUES ('Day', '10:00', '19:00', 10, 60, '{0,1,2,3,4,5}', $1, $2) RETURNING id, start_time::text, end_time::text`, [addDays(firstDay, -30), adminId]);
  const lateShift = await one(`INSERT INTO hr_shifts(name, start_time, end_time, grace_minutes, break_minutes, working_days, effective_from, created_by)
    VALUES ('Late', '11:00', '20:00', 10, 60, '{0,1,2,3,4,6}', $1, $2) RETURNING id, start_time::text, end_time::text`, [addDays(firstDay, -30), adminId]);
  const shiftOf = new Map();
  staff.forEach((member, index) => shiftOf.set(member.id, index % 2 ? lateShift : dayShift));
  for (const member of staff) {
    await q(`INSERT INTO hr_shift_assignments(staff_id, shift_id, kind, effective_from, created_by) VALUES ($1,$2,'DEFAULT',$3,$4)`, [member.id, shiftOf.get(member.id).id, addDays(firstDay, -30), adminId]);
  }
  const holidayDate = addDays(firstDay, Math.floor(DAYS / 2));
  await q("INSERT INTO hr_holidays(holiday_date, name, is_mandatory, created_by) VALUES ($1, 'Festival holiday', TRUE, $2) ON CONFLICT DO NOTHING", [holidayDate, adminId]);
  const leaveTypes = await all('SELECT id, name, is_paid FROM hr_leave_types');
  const sickType = leaveTypes.find((t) => t.name === 'Sick Leave');
  await q("UPDATE hr_leave_types SET annual_allocation_days = 12 WHERE name IN ('Sick Leave','Annual Leave')");

  /* ------------------------------------------------------------- counters */
  let billNo = Number((await one("SELECT COALESCE(MAX(NULLIF(regexp_replace(bill_number, '\\D', '', 'g'), '')::bigint), 0) AS n FROM salon_bills")).n);
  let apptNo = Number((await one("SELECT COALESCE(MAX(NULLIF(regexp_replace(appointment_number, '\\D', '', 'g'), '')::bigint), 0) AS n FROM appointments")).n);
  let purchaseNo = 0;
  let paymentNo = 0;
  let key = 0;
  const ik = (prefix) => `demo-${prefix}-${++key}`;
  let drawer = 3000; // cash counted at the last close = next opening cash
  const stats = { bills: 0, voids: 0, reviews: 0, appointments: 0, attendance: 0 };

  /* ------------------------------------------------------------- one day */
  for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
    const date = addDays(firstDay, dayIndex);
    const weekday = weekdayOf(date);
    const isHoliday = date === holidayDate;
    if (isHoliday) continue; // salon closed

    const openingCash = drawer;
    const bd = await one(`INSERT INTO business_days(business_date, status, opened_at, opened_by, opening_cash, previous_closing_cash, created_at)
      VALUES ($1,'OPEN',$2,$3,$4,$4,$2) RETURNING id`, [date, at(date, '09:40'), cashierId, openingCash]);
    const session = await one(`INSERT INTO store_sessions(business_day_id, session_number, status, opened_at, opened_by, starting_cash, previous_session_closing_cash, created_at)
      VALUES ($1,1,'OPEN',$2,$3,$4,$4,$2) RETURNING id`, [bd.id, at(date, '09:40'), cashierId, openingCash]);
    let cashIn = 0; let cashOut = 0; let creditCashIn = 0; let refundsCash = 0; let savingsCash = 0;

    // Tokens counter per day
    let tokenNo = 0;
    const busy = weekday === 6 ? 1.45 : weekday === 5 ? 1.2 : 1; // Saturday busiest
    const billCount = Math.round(between(13, 26) * busy);
    const dayBills = [];

    for (let b = 0; b < billCount; b += 1) {
      const minute = between(10 * 60 + 5, 19 * 60 + 45);
      const when = at(date, clock(minute));
      const identified = chance(0.68);
      const customer = identified ? (chance(0.6) ? pick(regulars) : pick(customers)) : null;
      const lines = [];
      const lineCount = weighted([[1, 60], [2, 30], [3, 10]]);
      for (let l = 0; l < lineCount; l += 1) {
        const service = l === 0 && chance(0.55) ? pick(haircuts) : pick(services);
        if (lines.some((line) => line.item_id === service.id)) continue;
        const member = staffFor(service);
        lines.push({ item_type: 'service', item_id: service.id, name: service.name, category: service.category, quantity: 1, unit_price: service.price, subtotal: service.price, staff: member, reward: false });
      }
      if (chance(0.14) && products.length) {
        const product = pick(products);
        const quantity = chance(0.85) ? 1 : 2;
        lines.push({ item_type: 'product', item_id: product.id, name: product.name, quantity, unit_price: product.price, subtotal: product.price * quantity, cost: product.cost, reward: false });
      }
      const subtotal = round2(lines.reduce((s, line) => s + line.subtotal, 0));
      let discount = 0; let discountType = 'amount';
      if (chance(0.1)) { if (chance(0.5)) { discountType = 'percentage'; discount = round2(subtotal * 0.1); } else discount = Math.min(subtotal, pick([50, 100, 150, 200])); }

      // Loyalty: a regular with a full card gets the free haircut on a haircut line.
      let loyaltyDiscount = 0;
      const rewardLine = customer && customer.loyalty >= 9 && chance(0.75) ? lines.find((line) => line.item_type === 'service' && line.item_id === rewardService.id) : null;
      if (rewardLine) { rewardLine.reward = true; loyaltyDiscount = Math.min(rewardLine.unit_price, subtotal - discount); }
      const grandTotal = round2(subtotal - discount - loyaltyDiscount);

      // Payment mix
      let method = weighted([['cash', 48], ['online', 40], ['split', 7], ['credit', 5]]);
      if (method === 'credit' && !(customer && customer.creditLimit > 0 && customer.credit + grandTotal <= customer.creditLimit)) method = 'cash';
      if (grandTotal === 0) method = 'cash';
      let cash = 0; let online = 0; let credit = 0; let qrType = null;
      if (method === 'cash') cash = grandTotal;
      else if (method === 'online') { online = grandTotal; qrType = chance(0.7) ? 'ESEWA_PHONEPAY' : 'BANK'; }
      else if (method === 'split') { cash = round2(Math.floor(grandTotal * 0.5)); online = round2(grandTotal - cash); qrType = 'ESEWA_PHONEPAY'; }
      else credit = grandTotal;
      const tendered = method === 'cash' ? Math.ceil(grandTotal / 100) * 100 : cash + online;
      const paymentStatus = credit === grandTotal && credit > 0 ? 'credit' : credit > 0 ? 'partial' : 'paid';

      // Token for about half the walk-ins
      let tokenId = null;
      if (chance(0.5)) {
        tokenNo += 1;
        const token = await one(`INSERT INTO walk_in_tokens(token_number, token_date, customer_id, customer_name, customer_phone, service_id, assigned_staff_id, status, created_by, billed_at, created_at, business_day_id, store_session_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'BILLED',$8,$9,$10,$11,$12) RETURNING id`,
        [`T${String(tokenNo).padStart(3, '0')}`, date, customer?.id || null, customer?.name || 'Walk-in', customer?.phone || null, lines[0].item_id, lines[0].staff?.id || null, cashierId, when, new Date(when.getTime() - between(10, 45) * 60000), bd.id, session.id]);
        tokenId = token.id;
      }

      billNo += 1;
      const bill = await one(`INSERT INTO salon_bills(bill_number, customer_id, customer_name, customer_phone, subtotal, discount_amount, discount_type, tax, tax_percent, service_charge, grand_total,
          payment_method, amount_paid, cash_amount, qr_amount, qr_type, total_paid, payment_status, cashier_id, token_id, transaction_time, status, created_at, business_day_id, store_session_id,
          revenue_business_day_id, payment_received_at, idempotency_key, credit_amount, loyalty_discount, loyalty_program_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,0,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'paid',$18,$19,$20,$19,$18,$21,$22,$23,$24) RETURNING id`,
      [`SALON-${String(billNo).padStart(7, '0')}`, customer?.id || null, customer?.name || 'Walk-in Customer', customer?.phone || null, subtotal, round2(discount + loyaltyDiscount), discountType, grandTotal,
        method, tendered, cash, online, qrType, round2(cash + online), paymentStatus, chance(0.8) ? cashierId : adminId, tokenId, when, bd.id, session.id, ik('bill'), credit, loyaltyDiscount, loyaltyDiscount ? program.id : null]);
      if (tokenId) await q('UPDATE walk_in_tokens SET invoice_id = $1 WHERE id = $2', [bill.id, tokenId]);
      stats.bills += 1;
      for (const line of lines) {
        const pct = line.staff ? Number(line.staff.pct) : 0;
        const row = await one(`INSERT INTO salon_bill_items(bill_id, item_type, item_id, name, quantity, unit_price, subtotal, staff_id, staff_name_snapshot, commission_percentage, commission_amount, unit_cost_snapshot, loyalty_reward, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [bill.id, line.item_type, line.item_id, line.name, line.quantity, line.unit_price, line.subtotal, line.staff?.id || null, line.staff?.name || null, pct, round2(line.subtotal * pct / 100), line.cost ?? null, line.reward, when]);
        line.id = row.id;
        if (line.item_type === 'product') {
          const p = await one('UPDATE salon_products SET current_stock = GREATEST(current_stock - $1, 0) WHERE id = $2 RETURNING current_stock', [line.quantity, line.item_id]);
          await q(`INSERT INTO inventory_movements(product_id, movement_type, quantity, previous_stock, new_stock, notes, created_at) VALUES ($1,'sale',$2,$3,$4,$5,$6)`,
            [line.item_id, line.quantity, Number(p.current_stock) + line.quantity, p.current_stock, `SALON-${String(billNo).padStart(7, '0')}`, when]);
        }
      }
      let index = 0;
      for (const [m, amount] of [['cash', cash], ['online', online], ['credit', credit]]) {
        if (amount <= 0) continue;
        const allocation = await one(`INSERT INTO salon_payment_allocations(bill_id, method, amount, provider, cash_tendered, change_amount, customer_id, business_day_id, store_session_id, created_by, idempotency_key, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [bill.id, m, amount, m === 'online' ? qrType : null, m === 'cash' ? (method === 'cash' ? tendered : amount) : null, m === 'cash' && method === 'cash' ? round2(tendered - amount) : 0,
          m === 'credit' ? customer.id : null, bd.id, session.id, cashierId, ik(`alloc${index++}`), when]);
        if (m === 'credit') {
          await q(`INSERT INTO customer_credit_ledger(customer_id, bill_id, allocation_id, entry_type, debit, credit, note, business_day_id, created_by, idempotency_key, created_at)
            VALUES ($1,$2,$3,'credit_sale',$4,0,'Invoice credit',$5,$6,$7,$8)`, [customer.id, bill.id, allocation.id, amount, bd.id, cashierId, ik('cl'), when]);
          customer.credit = round2(customer.credit + amount);
        }
      }
      cashIn += cash;

      // Loyalty ledger (fully paid bills of identified customers only)
      if (customer) {
        customer.visits += 1;
        customer.spent = round2(customer.spent + grandTotal);
        if (rewardLine) {
          await q(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, source, balance_before, balance_after, note, created_by, created_at)
            VALUES ($1,$2,$3,$4,'REDEEM',-9,'POS',$5,$6,$7,$8,$9)`, [customer.id, program.id, bill.id, rewardLine.id, customer.loyalty, customer.loyalty - 9, `Free ${rewardService.name}`, cashierId, when]);
          customer.loyalty -= 9;
        }
        if (paymentStatus === 'paid') {
          for (const line of lines) {
            if (line.item_type === 'service' && line.category === 'Haircut' && !line.reward) {
              await q(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, source, created_by, created_at) VALUES ($1,$2,$3,$4,'EARN',1,'POS',$5,$6)`,
                [customer.id, program.id, bill.id, line.id, cashierId, when]);
              customer.loyalty += 1;
            }
          }
        }
      }
      dayBills.push({ id: bill.id, when, customer, lines, cash, online, credit, grandTotal });

      // Some visits were booked appointments
      if (customer && chance(0.16)) {
        apptNo += 1;
        const start = Math.max(10 * 60, minute - between(30, 70));
        const duration = lines.filter((line) => line.item_type === 'service').length * 30;
        const appt = await one(`INSERT INTO appointments(appointment_number, customer_id, customer_name, customer_phone, appointment_date, start_time, end_time, duration_minutes, staff_id, status, source,
            created_by, confirmed_at, checked_in_at, started_at, completed_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'COMPLETED',$10,$11,$12,$13,$13,$14,$12,$14) RETURNING id`,
        [`APT-${String(apptNo).padStart(6, '0')}`, customer.id, customer.name, customer.phone, date, clock(start), clock(start + duration), duration, lines[0].staff?.id || null,
          weighted([['PHONE', 45], ['WEBSITE', 30], ['WHATSAPP', 15], ['WALK_IN', 10]]), cashierId, at(addDays(date, -between(0, 3)), '12:00'), at(date, clock(start)), when]);
        for (const [i, line] of lines.filter((l) => l.item_type === 'service').entries()) {
          await q('INSERT INTO appointment_services(appointment_id, service_id, service_name, duration_minutes, price, sort_order) VALUES ($1,$2,$3,30,$4,$5)', [appt.id, line.item_id, line.name, line.unit_price, i]);
        }
        await q('UPDATE salon_bills SET appointment_id = $1 WHERE id = $2', [appt.id, bill.id]);
        stats.appointments += 1;
      }

      // Reviews: some customers leave feedback (never linked to rewards)
      if (customer && paymentStatus === 'paid' && chance(0.24)) {
        const rating = weighted([[5, 55], [4, 28], [3, 10], [2, 4], [1, 3]]);
        const texts = {
          5: ['Excellent haircut, very professional staff.', 'Best salon in town! Clean and friendly.', 'Loved the service, will come again.', 'Great fade, exactly what I asked for.'],
          4: ['Good service, slightly long wait.', 'Nice haircut, friendly barber.', 'Clean place and good value.'],
          3: ['It was okay.', 'Average experience, waited quite long.'],
          2: ['Not happy with the cut this time.', 'Had to wait 40 minutes.'],
          1: ['Very disappointed with the service.'],
        };
        const submitted = new Date(when.getTime() + between(1, 48) * 3600000);
        const recent = dayIndex > DAYS - 5;
        const consent = chance(0.8);
        const status = recent ? 'PENDING' : rating >= 4 && consent ? weighted([['PUBLISHED', 60], ['PRIVATE', 40]]) : 'PRIVATE';
        const service = lines.find((line) => line.item_type === 'service');
        await q(`INSERT INTO customer_reviews(form_id, customer_id, bill_id, service_id, staff_id, overall_rating, answers, review_text, display_name, public_consent, verified, status, source, submitted_at, moderated_by, moderated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,TRUE,$11,'QR',$12,$13,$14)`,
        [form?.id || null, customer.id, bill.id, service?.item_id || null, service?.staff?.id || null, rating,
          JSON.stringify([{ id: 'service_quality', label: 'Service quality', type: 'STAR', value: Math.min(5, rating + (chance(0.3) ? 1 : 0)) }, { id: 'cleanliness', label: 'Cleanliness', type: 'STAR', value: between(Math.max(1, rating - 1), 5) }]),
          pick(texts[rating]), customer.name.split(' ')[0], consent, status, submitted, status === 'PENDING' ? null : adminId, status === 'PENDING' ? null : new Date(submitted.getTime() + 86400000)]);
        stats.reviews += 1;
      }
    }

    // A few cancelled / no-show tokens
    for (let t = 0; t < between(0, 3); t += 1) {
      tokenNo += 1;
      const status = chance(0.5) ? 'CANCELLED' : 'NO_SHOW';
      await q(`INSERT INTO walk_in_tokens(token_number, token_date, customer_name, service_id, status, created_by, created_at, ${status === 'CANCELLED' ? 'cancelled_at' : 'no_show_at'}, business_day_id, store_session_id)
        VALUES ($1,$2,'Walk-in',$3,$4,$5,$6,$6,$7,$8)`, [`T${String(tokenNo).padStart(3, '0')}`, date, pick(services).id, status, cashierId, at(date, clock(between(600, 1140))), bd.id, session.id]);
    }

    // Appointments that did not happen
    if (chance(0.5)) {
      apptNo += 1;
      const c = pick(customers);
      const status = chance(0.5) ? 'CANCELLED' : 'NO_SHOW';
      const service = pick(services);
      const appt = await one(`INSERT INTO appointments(appointment_number, customer_id, customer_name, customer_phone, appointment_date, start_time, end_time, duration_minutes, staff_id, status, source, cancel_reason, created_by, cancelled_at, no_show_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'15:00','15:30',30,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
      [`APT-${String(apptNo).padStart(6, '0')}`, c.id, c.name, c.phone, date, staffFor(service).id, status, pick(['PHONE', 'WEBSITE']), status === 'CANCELLED' ? 'Customer rescheduled' : null, cashierId,
        status === 'CANCELLED' ? at(date, '12:00') : null, status === 'NO_SHOW' ? at(date, '15:30') : null, at(addDays(date, -1), '18:00')]);
      await q('INSERT INTO appointment_services(appointment_id, service_id, service_name, duration_minutes, price) VALUES ($1,$2,$3,30,$4)', [appt.id, service.id, service.name, service.price]);
      stats.appointments += 1;
    }

    // Occasional void (processed the same day, money refunded, loyalty reversed)
    if (chance(0.35) && dayBills.length > 3) {
      const target = pick(dayBills.filter((x) => x.credit === 0));
      if (target) {
        const correction = await one(`INSERT INTO financial_corrections(source_type, source_id, correction_type, amount, reason, metadata, business_day_id, store_session_id, created_by, idempotency_key, created_at)
          VALUES ('salon_bill',$1,'void',$2,$3,'{}'::jsonb,$4,$5,$6,$7,$8) RETURNING id`, [target.id, target.grandTotal, pick(['Wrong service billed', 'Customer changed mind', 'Duplicate bill']), bd.id, session.id, adminId, ik('void'), new Date(target.when.getTime() + 1800000)]);
        for (const [m, amount] of [['cash', target.cash], ['online', target.online]]) {
          if (amount > 0) await q(`INSERT INTO payment_refunds(bill_id, correction_id, method, amount, business_day_id, store_session_id, created_by, idempotency_key, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [target.id, correction.id, m, amount, bd.id, session.id, adminId, ik('refund'), new Date(target.when.getTime() + 1800000)]);
        }
        refundsCash += target.cash;
        await q("UPDATE salon_bills SET status = 'cancelled' WHERE id = $1", [target.id]);
        const entries = await all("SELECT * FROM loyalty_ledger WHERE bill_id = $1 AND entry_type IN ('EARN','REDEEM')", [target.id]);
        for (const entry of entries) {
          await q(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, reversal_of, source, note, created_by, created_at) VALUES ($1,$2,$3,$4,'REVERSAL',$5,$6,'VOID','Bill voided',$7,$8)`,
            [entry.customer_id, entry.program_id, target.id, entry.bill_item_id, -entry.visits, entry.id, adminId, new Date(target.when.getTime() + 1800000)]);
          if (target.customer) target.customer.loyalty -= entry.visits;
        }
        await q('UPDATE customer_reviews SET status = \'ARCHIVED\' WHERE bill_id = $1', [target.id]);
        stats.voids += 1;
      }
    }

    // Credit collections
    for (const c of customers.filter((x) => x.credit > 0 && chance(0.12))) {
      const amount = chance(0.6) ? c.credit : round2(Math.floor(c.credit / 2));
      if (amount <= 0) continue;
      const cashPaid = chance(0.6);
      const whenPaid = at(date, clock(between(11 * 60, 19 * 60)));
      const ledger = await one(`INSERT INTO customer_credit_ledger(customer_id, entry_type, debit, credit, note, business_day_id, created_by, idempotency_key, created_at) VALUES ($1,'credit_collection',0,$2,'Credit collection',$3,$4,$5,$6) RETURNING id`,
        [c.id, amount, bd.id, cashierId, ik('cc'), whenPaid]);
      await q(`INSERT INTO customer_credit_collections(customer_id, amount, payment_method, provider, cash_tendered, change_amount, business_day_id, store_session_id, ledger_id, created_by, idempotency_key, created_at)
        VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11)`, [c.id, amount, cashPaid ? 'cash' : 'online', cashPaid ? null : 'eSewa', cashPaid ? amount : null, bd.id, session.id, ledger.id, cashierId, ik('ccol'), whenPaid]);
      if (cashPaid) creditCashIn += amount;
      c.credit = round2(c.credit - amount);
    }

    // Expenses: petty cash daily, fixed costs monthly
    const expense = async (title, category, amount, method, time = '13:00') => {
      await q(`INSERT INTO expenses(title, category, amount, payment_method, cash_amount, online_amount, paid_by, expense_date, record_type, business_day_id, store_session_id, created_by, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'Front desk',$7,'EXPENSE',$8,$9,$10,$11)`, [title, category, amount, method, method === 'cash' ? amount : 0, method === 'cash' ? 0 : amount, date, bd.id, session.id, cashierId, at(date, time)]);
      if (method === 'cash') cashOut += amount;
    };
    await expense('Tea & snacks', 'TEA_SNACKS', between(4, 12) * 20, 'cash', '11:30');
    if (chance(0.5)) await expense('Water jar', 'WATER_JAR', 120, 'cash', '10:15');
    if (chance(0.3)) await expense(pick(['Cleaning supplies', 'Towels wash']), 'CLEANING', between(3, 10) * 50, 'cash');
    if (chance(0.15)) await expense('Local transport', 'TRANSPORT', between(2, 6) * 50, 'cash');
    if (date.endsWith('-01') || dayIndex === 0) {
      await expense('Monthly rent', 'Rent', 35000, 'online', '10:30');
      await expense('Electricity bill', 'Electricity', between(28, 42) * 100, 'online', '10:40');
      await expense('Internet', 'Internet', 1500, 'online', '10:45');
    }
    if (chance(0.06)) await expense('Social media promotion', 'Marketing', between(10, 30) * 100, 'online');

    // Supplier purchases every ~9 days; some paid in cash now, some on credit
    if (dayIndex % 9 === 4 && products.length) {
      const supplier = pick(suppliers);
      purchaseNo += 1;
      const items = products.slice().sort(() => rand() - 0.5).slice(0, between(2, 4)).map((p) => ({ ...p, quantity: between(4, 12) }));
      const total = round2(items.reduce((s, i) => s + i.quantity * i.cost, 0));
      const purchase = await one(`INSERT INTO purchases(purchase_number, supplier_id, purchase_date, supplier_invoice, subtotal, discount, tax, total, status, business_day_id, store_session_id, created_by, created_at)
        VALUES ($1,$2,$3,$4,$5,0,0,$5,'RECEIVED',$6,$7,$8,$9) RETURNING id`, [`PUR-${String(purchaseNo).padStart(6, '0')}`, supplier.id, date, `INV-${between(1000, 9999)}`, total, bd.id, session.id, adminId, at(date, '12:30')]);
      for (const item of items) {
        await q('INSERT INTO purchase_items(purchase_id, product_id, product_name, quantity, unit_cost, line_total) VALUES ($1,$2,$3,$4,$5,$6)', [purchase.id, item.id, item.name, item.quantity, item.cost, round2(item.quantity * item.cost)]);
        const p = await one('UPDATE salon_products SET current_stock = current_stock + $1 WHERE id = $2 RETURNING current_stock', [item.quantity, item.id]);
        await q(`INSERT INTO inventory_movements(product_id, movement_type, quantity, previous_stock, new_stock, notes, purchase_id, created_at) VALUES ($1,'stock_in',$2,$3,$4,$5,$6,$7)`,
          [item.id, item.quantity, Number(p.current_stock) - item.quantity, p.current_stock, `PUR-${String(purchaseNo).padStart(6, '0')}`, purchase.id, at(date, '12:30')]);
      }
      supplier.owed = round2(supplier.owed + total);
      if (chance(0.7)) {
        const pay = round2(Math.min(supplier.owed, chance(0.5) ? total : Math.floor(total / 2)));
        const method = chance(0.4) ? 'cash' : 'online';
        if (!(method === 'cash' && pay > openingCash + cashIn - cashOut - 500)) {
          paymentNo += 1;
          const payment = await one(`INSERT INTO supplier_payments(payment_number, supplier_id, purchase_id, amount, payment_method, payment_date, business_day_id, store_session_id, created_by, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [`SPAY-${String(paymentNo).padStart(6, '0')}`, supplier.id, purchase.id, pay, method, date, bd.id, session.id, adminId, at(date, '12:40')]);
          const exp = await one(`INSERT INTO expenses(title, category, amount, payment_method, cash_amount, online_amount, paid_to, expense_date, reference_number, record_type, business_day_id, store_session_id, created_by, created_at, supplier_payment_id)
            VALUES ($1,'Product Purchase',$2,$3,$4,$5,$6,$7,$8,'EXPENSE',$9,$10,$11,$12,$13) RETURNING id`,
          [`Supplier payment - ${supplier.name}`, pay, method, method === 'cash' ? pay : 0, method === 'cash' ? 0 : pay, supplier.name, date, `SPAY-${String(paymentNo).padStart(6, '0')}`, bd.id, session.id, adminId, at(date, '12:40'), payment.id]);
          await q('UPDATE supplier_payments SET expense_id = $1 WHERE id = $2', [exp.id, payment.id]);
          if (method === 'cash') cashOut += pay;
          supplier.owed = round2(supplier.owed - pay);
        }
      }
    }

    // Weekly bank deposit from the drawer
    if (weekday === 0 && dayIndex > 0) {
      const available = openingCash + cashIn + creditCashIn - cashOut - refundsCash;
      const amount = Math.max(0, Math.floor((available - 3000) / 1000) * 1000);
      if (amount > 0) {
        await q(`INSERT INTO savings_deposits(deposit_type, amount, source_account, institution_name, deposit_date, status, created_by, created_at, business_day_id, store_session_id)
          VALUES ('BANK_DEPOSIT',$1,'CASH','Nabil Bank',$2,'ACTIVE',$3,$4,$5,$6)`, [amount, date, adminId, at(date, '18:30'), bd.id, session.id]);
        savingsCash += amount;
      }
    }

    // HR attendance for everyone rostered today
    for (const member of staff) {
      const shift = shiftOf.get(member.id);
      const workingDays = shift.id === dayShift.id ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 6];
      if (!workingDays.includes(weekday)) continue;
      if (chance(0.03)) continue; // absent — no record
      if (chance(0.025) && sickType) {
        await q(`INSERT INTO hr_leave_requests(staff_id, leave_type_id, start_date, end_date, days, reason, status, requested_by, requested_at, decided_by, decided_at)
          VALUES ($1,$2,$3,$3,1,'Not feeling well','APPROVED',$1,$4,$5,$4)`, [member.id, sickType.id, date, at(date, '08:00'), adminId]);
        continue;
      }
      const window = shiftWindow(date, { start_time: shift.start_time, end_time: shift.end_time });
      const [sh, sm] = shift.start_time.split(':').map(Number);
      const [eh, em] = shift.end_time.split(':').map(Number);
      const inMin = sh * 60 + sm + weighted([[-10, 30], [-3, 30], [5, 20], [18, 12], [35, 8]]) + between(-3, 3);
      const outMin = eh * 60 + em + weighted([[0, 45], [8, 25], [40, 15], [75, 8], [-35, 7]]) + between(0, 5);
      const clockIn = at(date, clock(inMin));
      const clockOut = at(date, clock(outMin));
      const calc = computeAttendance({ window, graceMinutes: 10, scheduledBreakMinutes: 60, clockIn, clockOut, policy: { overtimeThresholdMinutes: 15 } });
      const record = await one(`INSERT INTO hr_attendance(staff_id, attendance_date, shift_id, day_type, scheduled_start, scheduled_end, grace_minutes, scheduled_break_minutes, clock_in, clock_out,
          break_minutes, worked_minutes, late_minutes, early_leave_minutes, overtime_minutes, status, source, created_by, updated_by, created_at, updated_at)
        VALUES ($1,$2,$3,'WORKING',$4,$5,10,60,$6,$7,$8,$9,$10,$11,$12,$13,'EMPLOYEE',$1,$1,$6,$7) RETURNING id`,
      [member.id, date, shift.id, window.start, window.end, clockIn, clockOut, calc.breakMinutes, calc.workedMinutes, calc.lateMinutes, calc.earlyLeaveMinutes, calc.overtimeMinutes, calc.lateMinutes > 0 ? 'LATE' : 'PRESENT']);
      stats.attendance += 1;
      if (calc.overtimeMinutes > 0) {
        const decided = dayIndex < DAYS - 4;
        const approve = decided && chance(0.8);
        await q(`INSERT INTO hr_overtime(staff_id, attendance_id, work_date, source, scheduled_minutes, worked_minutes, potential_minutes, approved_minutes, status, decided_by, decided_at, decision_note)
          VALUES ($1,$2,$3,'ATTENDANCE',$4,$5,$6,$7,$8,$9,$10,$11)`,
        [member.id, record.id, date, calc.scheduledMinutes, calc.workedMinutes, calc.overtimeMinutes, approve ? calc.overtimeMinutes : 0, !decided ? 'PENDING' : approve ? 'APPROVED' : 'REJECTED',
          decided ? adminId : null, decided ? at(addDays(date, 1), '10:00') : null, decided && !approve ? 'Not pre-approved' : null]);
      }
    }

    // Close the day with the same maths as computeExpectedCash
    const expected = round2(openingCash + cashIn + creditCashIn - cashOut - refundsCash - savingsCash);
    const diff = chance(0.8) ? 0 : pick([-100, -50, -20, 10, 20]);
    const counted = round2(expected + diff);
    await q(`UPDATE store_sessions SET status = 'CLOSED', closed_at = $2, closed_by = $3, expected_cash = $4, counted_cash = $5, cash_difference = $6, updated_at = $2 WHERE id = $1`,
      [session.id, at(date, '20:15'), cashierId, expected, counted, diff]);
    await q(`UPDATE business_days SET status = 'CLOSED', closed_at = $2, closed_by = $3, expected_cash = $4, counted_cash = $5, cash_difference = $6, updated_at = $2 WHERE id = $1`,
      [bd.id, at(date, '20:15'), cashierId, expected, counted, diff]);
    drawer = counted;
  }

  /* ------------------------------------------------------------- after the loop */
  // Upcoming appointments (next 7 days), some website requests awaiting confirmation
  for (let d = 0; d < 7; d += 1) {
    const date = addDays(today, d + 1);
    for (let n = 0; n < between(2, 5); n += 1) {
      apptNo += 1;
      const c = pick(customers);
      const service = pick(haircuts);
      const start = between(20, 36) * 30;
      const website = chance(0.3);
      const appt = await one(`INSERT INTO appointments(appointment_number, customer_id, customer_name, customer_phone, appointment_date, start_time, end_time, duration_minutes, staff_id, status, source, created_by, confirmed_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,30,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING id`,
      [`APT-${String(apptNo).padStart(6, '0')}`, c.id, c.name, c.phone, date, clock(start), clock(start + 30), staffFor(service).id, website ? 'PENDING' : 'CONFIRMED', website ? 'WEBSITE' : 'PHONE', website ? null : cashierId, website ? null : new Date()]);
      await q('INSERT INTO appointment_services(appointment_id, service_id, service_name, duration_minutes, price) VALUES ($1,$2,$3,30,$4)', [appt.id, service.id, service.name, service.price]);
    }
  }

  // Last month's payroll (settled from the drawer on the 1st would have shown in that day's cash;
  // recorded here as online bank transfers so closed days stay reconciled).
  const lastMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  for (const member of staff) {
    const commission = Number((await one(`SELECT COALESCE(SUM(i.commission_amount),0) AS c FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id
      WHERE i.staff_id = $1 AND b.status = 'paid' AND to_char(b.transaction_time AT TIME ZONE 'Asia/Kathmandu', 'YYYY-MM') = $2`, [member.id, lastMonth])).c);
    if (!commission && !Number(member.salary)) continue;
    const total = round2(Number(member.salary) + commission);
    const pay = await one(`INSERT INTO salary_payments(staff_id, salary_month, base_salary, commission_earned, total_payable, amount_paid, remaining_balance, payment_method, online_amount, payment_status, payment_date, created_by, updated_by, advance_applied)
      VALUES ($1,$2,$3,$4,$5,$5,0,'online',$5,'paid',$6,$7,$7,0) RETURNING id`, [member.id, lastMonth, member.salary, round2(commission), total, `${today.slice(0, 7)}-01` <= today ? `${today.slice(0, 7)}-01` : today, adminId]);
    await q(`INSERT INTO expenses(title, category, amount, payment_method, online_amount, paid_to, expense_date, reference_number, record_type, salary_payment_id, created_by)
      VALUES ($1,'Staff Salary',$2,'online',$2,$3,$4,$5,'EXPENSE',$6,$7)`, [`Salary payment - ${member.name} - ${lastMonth}`, total, member.name, `${today.slice(0, 7)}-01`, `SALARY-${lastMonth}-${member.id}`, pay.id, adminId]);
  }

  // Customer rollups + document sequences so the app continues numbering after the demo
  for (const c of customers) {
    await q(`UPDATE customers SET total_visits = $2::int, total_spent = $3::numeric,
      customer_category = CASE WHEN $3::numeric >= 50000 THEN 'VIP Customer' WHEN $2::int >= 2 THEN 'Returning Customer' ELSE 'New Customer' END WHERE id = $1`, [c.id, c.visits, c.spent]);
  }
  await q(`INSERT INTO document_sequences(document_type, next_value) VALUES ('salon_bill', $1), ('appointment', $2), ('purchase', $3), ('supplier_payment', $4)
    ON CONFLICT (document_type) DO UPDATE SET next_value = GREATEST(document_sequences.next_value, EXCLUDED.next_value)`, [billNo + 1, apptNo + 1, purchaseNo + 1, paymentNo + 1]);
  await q('UPDATE salon_products SET current_stock = GREATEST(current_stock, low_stock_threshold + 3) WHERE id IN (SELECT id FROM salon_products ORDER BY id LIMIT 3)');

  await q('COMMIT');
  console.log(`Demo data for ${DAYS} days → ${dbName}: ${stats.bills} bills (${stats.voids} voided), ${stats.appointments} appointments, ${stats.reviews} reviews, ${stats.attendance} attendance days, ${customers.length} customers, ${suppliers.length} suppliers.`);
} catch (error) {
  await q('ROLLBACK');
  console.error('Demo seed failed — nothing was written:', error.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
