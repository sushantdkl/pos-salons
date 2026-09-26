/**
 * Appointment system regression — drives the real app over HTTP (QA database only).
 *
 *   QA_BASE_URL=http://localhost:3013 QA_DATABASE_URL=<..._qa> node scripts/qa/appointments-scenario.mjs
 *
 * Runs on a freshly seeded QA database (scripts/qa/seed-qa.mjs):
 *   A  appointment -> confirm -> check in (token) -> start -> complete -> ONE bill
 *   B  double-booking blocked; cashier cannot override; admin override needs a reason and is logged
 *   C  cancellation needs a reason; no-show; a freed slot surfaces the waitlist
 *   D  working hours, days off and time off are enforced
 *   E  public website booking: pending request, free-slot list, honeypot, switch-off, duplicates
 *   F  permissions: service staff see only their own schedule (no phone) and cannot book
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3013';
const PASSWORD = process.env.QA_PASSWORD || 'QaPass!2026';
const DB_URL = process.env.QA_DATABASE_URL;
if (!DB_URL || !new URL(DB_URL).pathname.endsWith('_qa')) throw new Error('QA_DATABASE_URL must point at a *_qa database');

const results = [];
const check = (label, ok, detail = '') => results.push({ ok: Boolean(ok), label, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });

async function call(token, method, path, body, headers = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = {};
  try { json = await response.json(); } catch { /* empty */ }
  return { status: response.status, json };
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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
const plusDays = (days) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const tomorrow = plusDays(1);

const admin = await login('qa_admin');
const cashier = await login('qa_cashier');
const barberToken = await login('qa_barber');
const services = (await must(admin, 'GET', '/api/admin/services')).services;
const svc = (name) => services.find((service) => service.name === name).id;
const staff = (await must(cashier, 'GET', '/api/admin/employees')).employees;
const barber = staff.find((member) => member.full_name === 'QA Barber');
const otherStaff = staff.find((member) => member.id !== barber.id && ['barber', 'stylist', 'beautician'].includes(member.salon_role));

/* ------------------------------------------------------------------ A */
await must(admin, 'POST', '/api/store', { action: 'open', startingCash: 1000 });
const created = await must(cashier, 'POST', '/api/appointments', {
  customerName: 'QA Appointment Guest', customerPhone: '9801234567', date: today, startTime: '10:00',
  staffId: barber.id, services: [svc('QA Haircut'), svc('QA Trim')], source: 'PHONE', status: 'CONFIRMED',
}, { 'Idempotency-Key': 'qa-appt-a' });
const a = created.appointment;
check('A created confirmed', a.status === 'CONFIRMED', a.status);
check('A duration = sum of services', a.durationMinutes === 60 && a.endTime === '11:00', `${a.durationMinutes} ${a.endTime}`);
check('A numbered', /^APT-\d{6}$/.test(a.number), a.number);
const again = await must(cashier, 'POST', '/api/appointments', {
  customerName: 'QA Appointment Guest', customerPhone: '9801234567', date: today, startTime: '10:00',
  staffId: barber.id, services: [svc('QA Haircut')], status: 'CONFIRMED',
}, { 'Idempotency-Key': 'qa-appt-a' });
check('A double submit returns the same appointment', again.appointment.id === a.id && again.duplicate === true);

const checkedIn = await must(cashier, 'POST', `/api/appointments/${a.id}`, { action: 'check_in', createToken: true });
check('A check-in issued a queue token', Boolean(checkedIn.appointment.tokenId), checkedIn.appointment.tokenNumber);
await must(barberToken, 'POST', `/api/appointments/${a.id}`, { action: 'start' });
await must(barberToken, 'POST', `/api/appointments/${a.id}`, { action: 'complete' });
const bill = await call(cashier, 'POST', '/api/admin/billing', {
  appointment_id: a.id, token_id: checkedIn.appointment.tokenId, customer_name: 'QA Appointment Guest',
  services: [{ id: svc('QA Haircut'), staff_id: barber.id }, { id: svc('QA Trim'), staff_id: barber.id }],
  payment_method: 'cash', amount_paid: 5700,
}, { 'Idempotency-Key': randomUUID() });
check('A bill created', bill.status === 201, bill.json.error);
const billed = await must(cashier, 'GET', `/api/appointments/${a.id}`);
check('A appointment linked to the bill', billed.appointment.billNumber === bill.json.bill?.bill_number, billed.appointment.billNumber);
check('A appointment completed', billed.appointment.status === 'COMPLETED', billed.appointment.status);
const second = await call(cashier, 'POST', '/api/admin/billing', {
  appointment_id: a.id, customer_name: 'QA Appointment Guest',
  services: [{ id: svc('QA Trim'), staff_id: barber.id }], payment_method: 'cash', amount_paid: 700,
}, { 'Idempotency-Key': randomUUID() });
check('A second bill for the same appointment rejected', second.status === 409, `${second.status} ${second.json.error}`);
const paidBills = (await db.query(`SELECT COUNT(*)::int n FROM salon_bills WHERE appointment_id = $1 AND status = 'paid'`, [a.id])).rows[0].n;
check('A exactly one paid bill in the database', paidBills === 1, paidBills);
const tokenRow = (await db.query('SELECT status, invoice_id FROM walk_in_tokens WHERE id = $1', [checkedIn.appointment.tokenId])).rows[0];
check('A check-in token closed by the bill', tokenRow.status === 'BILLED' && tokenRow.invoice_id, tokenRow);
const noRevenue = (await db.query(`SELECT COUNT(*)::int n FROM salon_bills WHERE appointment_id IS NOT NULL AND id <> $1`, [bill.json.bill?.id || 0])).rows[0].n;
check('A booking alone creates no bill / revenue', noRevenue === 0, noRevenue);

/* ------------------------------------------------------------------ B */
const clashBody = {
  customerName: 'QA Clash', customerPhone: '9807654321', date: tomorrow, startTime: '14:00',
  staffId: barber.id, services: [svc('QA Haircut')], status: 'CONFIRMED',
};
const b1 = await must(cashier, 'POST', '/api/appointments', clashBody);
const clash = await call(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Clash 2', startTime: '14:15' });
check('B overlapping confirmed booking blocked', clash.status === 409 && clash.json.code === 'SCHEDULE_CONFLICT', clash.json.error);
check('B conflict explains the clash', (clash.json.issues || []).some((issue) => issue.code === 'DOUBLE_BOOKED'), clash.json.issues);
check('B cashier sees no override option', clash.json.overridable === false);
const cashierOverride = await call(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Clash 2', startTime: '14:15', override: { apply: true, reason: 'try' } });
check('B cashier override refused', cashierOverride.status === 403, cashierOverride.status);
const noReason = await call(admin, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Clash 2', startTime: '14:15', override: { apply: true, reason: '' } });
check('B admin override without a reason refused', noReason.status === 409, noReason.status);
const overridden = await call(admin, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Clash 2', startTime: '14:15', override: { apply: true, reason: 'Customer agreed to a short wait' } });
check('B admin override with reason accepted', overridden.status === 201, overridden.json.error);
const overrideEvents = (await db.query(`SELECT COUNT(*)::int n FROM appointment_events WHERE appointment_id = $1 AND event_type = 'conflict_override'`, [overridden.json.appointment?.id || 0])).rows[0].n;
check('B override stored in the audit history', overrideEvents === 1 && overridden.json.appointment?.overrideReason, overrideEvents);
const pending = await must(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Tentative', startTime: '14:30', status: 'PENDING' });
check('B tentative (pending) booking allowed', pending.appointment.status === 'PENDING');
const confirmClash = await call(cashier, 'POST', `/api/appointments/${pending.appointment.id}`, { action: 'confirm' });
check('B confirming into a clash blocked', confirmClash.status === 409, confirmClash.status);
const reschedule = await call(cashier, 'PATCH', `/api/appointments/${pending.appointment.id}`, { startTime: '16:00' });
check('B reschedule pending to a free slot', reschedule.status === 200 && reschedule.json.appointment?.startTime === '16:00', reschedule.json.error);
const confirmed = await call(cashier, 'POST', `/api/appointments/${pending.appointment.id}`, { action: 'confirm' });
check('B confirm after reschedule', confirmed.status === 200 && confirmed.json.appointment?.status === 'CONFIRMED', confirmed.json.error);
const futureCheckIn = await call(cashier, 'POST', `/api/appointments/${b1.appointment.id}`, { action: 'check_in' });
check('B cannot check in a future appointment', futureCheckIn.status === 409, futureCheckIn.status);

/* ------------------------------------------------------------------ C */
await must(cashier, 'POST', '/api/appointments/waitlist', { customerName: 'QA Waiting', customerPhone: '9811111111', requestedDate: tomorrow, serviceId: svc('QA Haircut'), flexibility: 'SAME_DAY' });
const cancelNoReason = await call(cashier, 'POST', `/api/appointments/${b1.appointment.id}`, { action: 'cancel' });
check('C cancel without a reason refused', cancelNoReason.status === 400, cancelNoReason.status);
const cancelled = await must(cashier, 'POST', `/api/appointments/${b1.appointment.id}`, { action: 'cancel', reason: 'Customer called to cancel' });
check('C cancelled', cancelled.appointment.status === 'CANCELLED' && cancelled.appointment.cancelReason);
check('C freed slot surfaces the waitlist', (cancelled.waitlistMatches || []).some((entry) => entry.customerName === 'QA Waiting'), cancelled.waitlistMatches?.length);
// 13:45-14:15 overlaps only the cancelled 14:00 booking (the override booking starts at 14:15).
const rebook = await call(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Rebook', startTime: '13:45' });
check('C cancelled slot is bookable again', rebook.status === 409 ? false : rebook.status === 201, rebook.json.error);
const noShowAppt = await must(cashier, 'POST', '/api/appointments', {
  customerName: 'QA No Show', customerPhone: '9812222222', date: today, startTime: '12:00', staffId: barber.id, services: [svc('QA Trim')],
});
const noShow = await must(cashier, 'POST', `/api/appointments/${noShowAppt.appointment.id}`, { action: 'no_show' });
check('C no-show recorded', noShow.appointment.status === 'NO_SHOW');
const billNoShow = await call(cashier, 'POST', '/api/admin/billing', {
  appointment_id: noShowAppt.appointment.id, customer_name: 'QA No Show', services: [{ id: svc('QA Trim'), staff_id: barber.id }], payment_method: 'cash', amount_paid: 700,
}, { 'Idempotency-Key': randomUUID() });
check('C a no-show cannot be billed', billNoShow.status === 409, `${billNoShow.status} ${billNoShow.json.error}`);

/* ------------------------------------------------------------------ D */
const late = await call(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Late', startTime: '19:45' });
check('D outside salon hours blocked', late.status === 409 && (late.json.issues || []).some((issue) => issue.code === 'OUTSIDE_HOURS'), late.json.error);
const weekday = new Date(`${plusDays(2)}T00:00:00Z`).getUTCDay();
const week = Array.from({ length: 7 }, (_, day) => ({ weekday: day, isOff: day === weekday, start: '10:00', end: '18:00' }));
const cashierHours = await call(cashier, 'PUT', '/api/appointments/schedule', { type: 'week', staffId: barber.id, week });
check('D cashier cannot change working hours', cashierHours.status === 403, cashierHours.status);
await must(admin, 'PUT', '/api/appointments/schedule', { type: 'week', staffId: barber.id, week });
const dayOff = await call(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Day Off', date: plusDays(2), startTime: '11:00' });
check('D staff day off blocked', dayOff.status === 409 && (dayOff.json.issues || []).some((issue) => issue.code === 'DAY_OFF'), dayOff.json.error);
await must(admin, 'PUT', '/api/appointments/schedule', { type: 'time_off', staffId: barber.id, startsAt: `${plusDays(3)}T13:00:00+05:45`, endsAt: `${plusDays(3)}T15:00:00+05:45`, reason: 'Training' });
const timeOff = await call(cashier, 'POST', '/api/appointments', { ...clashBody, customerName: 'QA Time Off', date: plusDays(3), startTime: '13:30' });
check('D time off blocked', timeOff.status === 409 && (timeOff.json.issues || []).some((issue) => issue.code === 'TIME_OFF'), timeOff.json.error);
const avail = await must(cashier, 'GET', `/api/appointments/availability?date=${plusDays(3)}&services=${svc('QA Haircut')}&staffId=${barber.id}`);
const slots = avail.availability.staff[0].slots;
check('D availability respects hours and time off', slots[0] === '10:00' && !slots.includes('13:00') && !slots.includes('14:30') && slots.includes('15:00') && slots.at(-1) === '17:30', `${slots[0]}…${slots.at(-1)}`);

/* ------------------------------------------------------------------ E */
const publicOptions = await call(null, 'GET', '/api/public/booking');
check('E public options without login', publicOptions.status === 200 && publicOptions.json.enabled && publicOptions.json.services.length > 0, publicOptions.status);
check('E public options expose no customer data', !JSON.stringify(publicOptions.json).includes('9801234567'));
const bookingDate = plusDays(4);
const publicSlots = await call(null, 'GET', `/api/public/booking?date=${bookingDate}&services=${svc('QA Colour')}&staffId=${barber.id}`);
const firstSlot = publicSlots.json.availability?.staff?.[0]?.slots?.[0];
check('E public free times listed', Boolean(firstSlot), firstSlot);
const request = await call(null, 'POST', '/api/public/booking', {
  customerName: 'QA Website Visitor', customerPhone: '9813333333', date: bookingDate, startTime: firstSlot,
  serviceIds: [svc('QA Colour')], staffId: barber.id, notes: 'First visit', idempotencyKey: randomUUID(),
});
check('E website request created as PENDING', request.status === 201 && request.json.booking?.status === 'PENDING', request.json.error || request.json.booking?.status);
const stored = (await db.query(`SELECT source, status, created_by FROM appointments WHERE appointment_number = $1`, [request.json.booking?.number])).rows[0];
check('E stored with source WEBSITE and no staff author', stored?.source === 'WEBSITE' && stored?.created_by === null, stored);
const afterSlots = await call(null, 'GET', `/api/public/booking?date=${bookingDate}&services=${svc('QA Colour')}&staffId=${barber.id}`);
check('E requested slot no longer offered publicly', !afterSlots.json.availability.staff[0].slots.includes(firstSlot));
const bot = await call(null, 'POST', '/api/public/booking', { customerName: 'Bot', customerPhone: '9814444444', date: bookingDate, startTime: '17:00', serviceIds: [svc('QA Trim')], website: 'http://spam' });
check('E honeypot rejects bots', bot.status === 400, bot.status);
const past = await call(null, 'POST', '/api/public/booking', { customerName: 'QA Past', customerPhone: '9815555555', date: plusDays(-1), startTime: '10:00', serviceIds: [svc('QA Trim')] });
check('E past dates rejected', past.status === 400, past.json.error);
const tooFar = await call(null, 'POST', '/api/public/booking', { customerName: 'QA Far', customerPhone: '9815555555', date: plusDays(90), startTime: '10:00', serviceIds: [svc('QA Trim')] });
check('E beyond booking window rejected', tooFar.status === 400, tooFar.json.error);
await must(admin, 'PUT', '/api/appointments/schedule', { type: 'settings', onlineBookingEnabled: false });
const off = await call(null, 'POST', '/api/public/booking', { customerName: 'QA Off', customerPhone: '9816666666', date: bookingDate, startTime: '17:00', serviceIds: [svc('QA Trim')] });
check('E switched-off online booking refuses requests', off.status === 403, off.status);
await must(admin, 'PUT', '/api/appointments/schedule', { type: 'settings', onlineBookingEnabled: true });
const confirmWeb = await call(cashier, 'POST', `/api/appointments/${(await db.query('SELECT id FROM appointments WHERE appointment_number = $1', [request.json.booking.number])).rows[0].id}`, { action: 'confirm' });
check('E salon confirms the website request', confirmWeb.status === 200 && confirmWeb.json.appointment.status === 'CONFIRMED', confirmWeb.json.error);

/* ------------------------------------------------------------------ F */
const barberList = await must(barberToken, 'GET', `/api/appointments?from=${today}&to=${plusDays(7)}`);
check('F staff list is only their own', barberList.appointments.length > 0 && barberList.appointments.every((item) => String(item.staffId) === String(barber.id)));
check('F staff list has no customer phone', barberList.appointments.every((item) => !('customerPhone' in item)));
const barberCreate = await call(barberToken, 'POST', '/api/appointments', clashBody);
check('F staff cannot book appointments', barberCreate.status === 403, barberCreate.status);
if (otherStaff) {
  const other = await must(cashier, 'POST', '/api/appointments', { customerName: 'QA Other', date: today, startTime: '15:00', staffId: otherStaff.id, services: [svc('QA Trim')] });
  const peek = await call(barberToken, 'GET', `/api/appointments/${other.appointment.id}`);
  check('F staff cannot open another stylist\'s appointment', peek.status === 403, peek.status);
  await must(cashier, 'POST', `/api/appointments/${other.appointment.id}`, { action: 'check_in' });
  const steal = await call(barberToken, 'POST', `/api/appointments/${other.appointment.id}`, { action: 'start' });
  check('F staff cannot start another stylist\'s appointment', steal.status === 403, steal.status);
}
const anonymousList = await call(null, 'GET', '/api/appointments');
check('F appointments API requires login', anonymousList.status === 401, anonymousList.status);

await db.end();
const failed = results.filter((row) => !row.ok);
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.label}${row.ok ? '' : `  ${row.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} appointment checks passed`);
process.exit(failed.length ? 1 : 0);
