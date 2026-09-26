/**
 * APPOINTMENTS — planned customers. Tokens remain the walk-in queue.
 *
 * Rules enforced here (not in any UI):
 *   - Status is the appointment lifecycle only; it never implies payment. Money happens only
 *     through the normal bill, which links to the appointment once (unique paid-bill index).
 *   - CONFIRMED / CHECKED_IN / IN_SERVICE appointments block their staff member's time.
 *     A conflicting or out-of-hours booking is rejected unless an ADMIN overrides it with a
 *     reason; the override is stored on the appointment and in its event history.
 *   - Scheduling for one staff member on one day is serialised with a transaction-scoped
 *     advisory lock, so two simultaneous requests cannot both take the same slot.
 *   - Every change is appended to appointment_events.
 */

import { cleanText } from '@/lib/salon-schema';
import { normalizePhone, PHONE_ERROR_MESSAGE } from '@/lib/validation/phone';
import { SERVICE_STAFF_ROLES } from '@/lib/staff/service-staff';
import { salonDateString } from '@/lib/reports/dashboard-period';
import { requireOpenSession } from '@/lib/business-day/service';
import { createWalkInToken } from '@/lib/tokens/service';

export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
export const APPOINTMENT_SOURCES = ['WALK_IN', 'PHONE', 'WEBSITE', 'WHATSAPP', 'STAFF', 'REBOOKING'];
/** Statuses that occupy a staff member's time. */
export const BLOCKING_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'];
const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'];

export const TRANSITIONS = {
  confirm: { from: ['PENDING'], to: 'CONFIRMED', stamp: 'confirmed_at', label: 'Confirmed' },
  check_in: { from: ['PENDING', 'CONFIRMED'], to: 'CHECKED_IN', stamp: 'checked_in_at', label: 'Checked in' },
  start: { from: ['CHECKED_IN'], to: 'IN_SERVICE', stamp: 'started_at', label: 'Service started' },
  complete: { from: ['CHECKED_IN', 'IN_SERVICE'], to: 'COMPLETED', stamp: 'completed_at', label: 'Completed' },
  cancel: { from: ['PENDING', 'CONFIRMED', 'CHECKED_IN'], to: 'CANCELLED', stamp: 'cancelled_at', label: 'Cancelled', needsReason: true },
  no_show: { from: ['PENDING', 'CONFIRMED'], to: 'NO_SHOW', stamp: 'no_show_at', label: 'No show' },
};

const SERVICE_STAFF_SQL = SERVICE_STAFF_ROLES.map((role) => `'${role}'`).join(', ');

/* ------------------------------------------------------------------ helpers */

export function httpError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

export function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function fromMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Minutes past midnight right now, Nepal time. */
function nowMinutesNepal() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

export async function getSchedulingSettings(db) {
  const rows = await db.all(`
    SELECT setting_key, setting_value FROM system_settings
    WHERE setting_key IN ('salon_open_time','salon_close_time','appointment_slot_minutes',
      'online_booking_enabled','online_booking_instant_confirm','online_booking_max_days_ahead')
  `);
  const map = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  const open = toMinutes(map.salon_open_time) ?? 9 * 60;
  const close = toMinutes(map.salon_close_time) ?? 20 * 60;
  const slot = Math.min(60, Math.max(5, Number(map.appointment_slot_minutes) || 15));
  return {
    openTime: fromMinutes(open),
    closeTime: fromMinutes(close),
    openMinutes: open,
    closeMinutes: close,
    slotMinutes: slot,
    onlineBookingEnabled: String(map.online_booking_enabled ?? 'true') !== 'false',
    instantConfirm: String(map.online_booking_instant_confirm ?? 'false') === 'true',
    maxDaysAhead: Math.min(180, Math.max(1, Number(map.online_booking_max_days_ahead) || 30)),
  };
}

async function recordEvent(tx, appointmentId, { type, from = null, to = null, note = null, details = null, actorId = null }) {
  await tx.run(`
    INSERT INTO appointment_events (appointment_id, event_type, from_status, to_status, note, details, actor_id)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?)
  `, [appointmentId, type, from, to, note, details ? JSON.stringify(details) : null, actorId]);
}

async function nextAppointmentNumber(tx) {
  const row = await tx.get(`
    INSERT INTO document_sequences(document_type, next_value) VALUES ('appointment', 2)
    ON CONFLICT (document_type) DO UPDATE SET next_value = document_sequences.next_value + 1, updated_at = NOW()
    RETURNING next_value - 1 AS value
  `);
  return `APT-${String(row.value).padStart(6, '0')}`;
}

/** Serialise scheduling for one staff member on one date (transaction-scoped). */
async function lockStaffDay(tx, staffId, date) {
  if (!staffId) return;
  await tx.get('SELECT pg_advisory_xact_lock(?::int, ?::int)', [Number(staffId), Number(String(date).replaceAll('-', ''))]);
}

async function assertServiceStaff(tx, staffId) {
  if (!staffId) return null;
  const staff = await tx.get(`
    SELECT u.id, COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS name
    FROM users u JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.id = ? AND u.is_active = TRUE AND sp.salon_role IN (${SERVICE_STAFF_SQL})
  `, [staffId]);
  if (!staff) throw httpError('Selected staff member is not available for appointments');
  return staff;
}

/**
 * Resolve requested services to real salon services. Each line keeps its own duration;
 * the appointment duration is their sum (services are performed one after another).
 */
async function resolveServiceLines(tx, services) {
  const ids = [...new Set((Array.isArray(services) ? services : [])
    .map((item) => Number(typeof item === 'object' ? item.serviceId ?? item.service_id ?? item.id : item))
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];
  const rows = await tx.all(
    `SELECT id, name, price, duration_minutes FROM salon_services WHERE is_active = TRUE AND id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return ids.map((id, index) => {
    const row = byId.get(id);
    if (!row) throw httpError('A selected service is no longer available');
    return {
      serviceId: id,
      name: row.name,
      price: Number(row.price || 0),
      duration: Math.max(5, Number(row.duration_minutes) || 30),
      sortOrder: index,
    };
  });
}

/** A staff member's hours on a date: their weekly row, else the salon's default hours. */
async function getStaffHours(db, staffId, date, settings) {
  const row = staffId
    ? await db.get('SELECT is_off, start_time::text AS start_time, end_time::text AS end_time FROM staff_working_hours WHERE staff_id = ? AND weekday = ?', [staffId, weekdayOf(date)])
    : null;
  if (row?.is_off) return { off: true, start: null, end: null };
  return {
    off: false,
    start: row ? toMinutes(row.start_time) : settings.openMinutes,
    end: row ? toMinutes(row.end_time) : settings.closeMinutes,
  };
}

async function getTimeOff(db, staffId, date) {
  if (!staffId) return [];
  const rows = await db.all(`
    SELECT id, reason,
           GREATEST(starts_at, (?::date)::timestamp AT TIME ZONE 'Asia/Kathmandu') AS from_ts,
           LEAST(ends_at, ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kathmandu')) AS to_ts
    FROM staff_time_off
    WHERE staff_id = ?
      AND starts_at < ((?::date + 1)::timestamp AT TIME ZONE 'Asia/Kathmandu')
      AND ends_at > ((?::date)::timestamp AT TIME ZONE 'Asia/Kathmandu')
  `, [date, date, staffId, date, date]);
  const minutesOf = (ts) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(ts)).split(':').map(Number);
    return parts[0] * 60 + parts[1];
  };
  return rows.map((row) => {
    const start = minutesOf(row.from_ts);
    const endRaw = minutesOf(row.to_ts);
    return { id: row.id, reason: row.reason, start, end: endRaw === 0 && start > 0 ? 24 * 60 : endRaw || 24 * 60 };
  });
}

/** Blocking appointments of a staff member that overlap [start, end). */
async function findConflicts(db, { staffId, date, start, end, excludeId = null, includePending = false }) {
  if (!staffId) return [];
  const statuses = includePending ? [...BLOCKING_STATUSES, 'PENDING'] : BLOCKING_STATUSES;
  return db.all(`
    SELECT id, appointment_number, customer_name, status,
           start_time::text AS start_time, end_time::text AS end_time
    FROM appointments
    WHERE staff_id = ? AND appointment_date = ?::date
      AND status IN (${statuses.map(() => '?').join(',')})
      AND start_time < ?::time AND end_time > ?::time
      ${excludeId ? 'AND id <> ?' : ''}
    ORDER BY start_time
  `, [staffId, date, ...statuses, fromMinutes(end), fromMinutes(start), ...(excludeId ? [excludeId] : [])]);
}

/** Everything wrong with putting this staff member in this slot, as readable issues. */
async function scheduleIssues(db, { staffId, date, start, end, excludeId, settings }) {
  if (!staffId) return [];
  const issues = [];
  const hours = await getStaffHours(db, staffId, date, settings);
  if (hours.off) issues.push({ code: 'DAY_OFF', message: 'The staff member is off on this day.' });
  else if (start < hours.start || end > hours.end) {
    issues.push({ code: 'OUTSIDE_HOURS', message: `Outside working hours (${fromMinutes(hours.start)}–${fromMinutes(hours.end)}).` });
  }
  const timeOff = await getTimeOff(db, staffId, date);
  for (const block of timeOff) {
    if (start < block.end && end > block.start) {
      issues.push({ code: 'TIME_OFF', message: `Blocked time ${fromMinutes(block.start)}–${fromMinutes(block.end)}${block.reason ? ` (${block.reason})` : ''}.` });
    }
  }
  const conflicts = await findConflicts(db, { staffId, date, start, end, excludeId });
  for (const conflict of conflicts) {
    issues.push({
      code: 'DOUBLE_BOOKED',
      message: `Overlaps ${conflict.appointment_number} (${conflict.customer_name}, ${conflict.start_time.slice(0, 5)}–${conflict.end_time.slice(0, 5)}).`,
      appointmentId: conflict.id,
    });
  }
  return issues;
}

/**
 * Throw unless the slot is clean, or an ADMIN overrides with a reason. Returns the override
 * (reason + issues) when one was applied, for the caller to persist and log.
 */
async function assertSchedulable(tx, { staffId, date, start, end, excludeId, settings, user, override }) {
  const issues = await scheduleIssues(tx, { staffId, date, start, end, excludeId, settings });
  if (!issues.length) return null;
  const reason = cleanText(override?.reason, '');
  if (override?.apply && user?.role === 'admin' && reason) return { reason, issues };
  if (override?.apply && user?.role !== 'admin') throw httpError('Only an admin can override a scheduling conflict.', 403);
  throw httpError(issues.map((issue) => issue.message).join(' '), 409, {
    code: 'SCHEDULE_CONFLICT',
    issues,
    overridable: user?.role === 'admin',
  });
}

async function findOrCreateCustomer(tx, { name, phone, create }) {
  if (!phone) return null;
  const existing = await tx.get('SELECT id, name FROM customers WHERE phone = ?', [phone]);
  if (existing || !create) return existing || null;
  const result = await tx.run('INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)', [name || `Customer ${phone}`, phone, 'Created from appointment']);
  return { id: result.lastInsertRowid, name };
}

/* -------------------------------------------------------------- read */

const APPOINTMENT_SELECT = `
  SELECT a.id, a.appointment_number, a.customer_id, a.customer_name, a.customer_phone,
         a.appointment_date::text AS appointment_date, a.start_time::text AS start_time, a.end_time::text AS end_time,
         a.duration_minutes, a.staff_id, a.status, a.source, a.notes,
         a.requested_service_text, a.requested_staff_text, a.token_id, a.conflict_override_reason,
         a.cancel_reason, a.created_at, a.updated_at, a.confirmed_at, a.checked_in_at, a.started_at,
         a.completed_at, a.cancelled_at, a.no_show_at,
         COALESCE(NULLIF(sp.display_name, ''), su.full_name) AS staff_name,
         COALESCE(cu.full_name, cu.username) AS created_by_name,
         wt.token_number,
         bill.id AS bill_id, bill.bill_number, bill.grand_total AS bill_total,
         COALESCE((
           SELECT json_agg(json_build_object('serviceId', aps.service_id, 'name', aps.service_name,
             'duration', aps.duration_minutes, 'price', aps.price) ORDER BY aps.sort_order, aps.id)
           FROM appointment_services aps WHERE aps.appointment_id = a.id
         ), '[]'::json) AS services
  FROM appointments a
  LEFT JOIN users su ON su.id = a.staff_id
  LEFT JOIN staff_profiles sp ON sp.user_id = a.staff_id
  LEFT JOIN users cu ON cu.id = a.created_by
  LEFT JOIN walk_in_tokens wt ON wt.id = a.token_id
  LEFT JOIN LATERAL (
    SELECT b.id, b.bill_number, b.grand_total FROM salon_bills b
    WHERE b.appointment_id = a.id AND LOWER(COALESCE(b.status, '')) IN ('paid', 'completed')
    ORDER BY b.id DESC LIMIT 1
  ) bill ON TRUE
`;

function mapAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.appointment_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    date: row.appointment_date,
    startTime: String(row.start_time).slice(0, 5),
    endTime: String(row.end_time).slice(0, 5),
    durationMinutes: Number(row.duration_minutes || 0),
    staffId: row.staff_id,
    staffName: row.staff_name || null,
    status: row.status,
    source: row.source,
    notes: row.notes,
    requestedServiceText: row.requested_service_text,
    requestedStaffText: row.requested_staff_text,
    tokenId: row.token_id,
    tokenNumber: row.token_number || null,
    billId: row.bill_id || null,
    billNumber: row.bill_number || null,
    billTotal: row.bill_total !== null && row.bill_total !== undefined ? Number(row.bill_total) : null,
    overrideReason: row.conflict_override_reason,
    cancelReason: row.cancel_reason,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
    services: (row.services || []).map((service) => ({ ...service, price: Number(service.price || 0) })),
    timestamps: {
      confirmedAt: row.confirmed_at, checkedInAt: row.checked_in_at, startedAt: row.started_at,
      completedAt: row.completed_at, cancelledAt: row.cancelled_at, noShowAt: row.no_show_at,
    },
  };
}

export async function getAppointment(db, id) {
  const row = await db.get(`${APPOINTMENT_SELECT} WHERE a.id = ?`, [id]);
  if (!row) throw httpError('Appointment not found', 404);
  const appointment = mapAppointment(row);
  appointment.events = (await db.all(`
    SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.details, e.created_at,
           COALESCE(u.full_name, u.username, 'Website') AS actor
    FROM appointment_events e LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.appointment_id = ? ORDER BY e.created_at, e.id
  `, [id])).map((event) => ({
    id: event.id, type: event.event_type, from: event.from_status, to: event.to_status,
    note: event.note, details: event.details, actor: event.actor, at: event.created_at,
  }));
  return appointment;
}

export async function listAppointments(db, { from, to, staffId = null, status = null, q = '' } = {}) {
  const start = isIsoDate(from) ? from : salonDateString();
  const end = isIsoDate(to) ? to : start;
  if (end < start) throw httpError('The end date is before the start date');
  if ((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000 > 92) throw httpError('Choose a range of at most three months');
  const clauses = ['a.appointment_date BETWEEN ?::date AND ?::date'];
  const params = [start, end];
  if (staffId) { clauses.push('a.staff_id = ?'); params.push(staffId); }
  if (status && APPOINTMENT_STATUSES.includes(status)) { clauses.push('a.status = ?'); params.push(status); }
  const search = cleanText(q, '');
  if (search) {
    clauses.push('(a.customer_name ILIKE ? OR a.customer_phone ILIKE ? OR a.appointment_number ILIKE ?)');
    params.push(`%${search}%`, `%${search.replace(/\D/g, '') || search}%`, `%${search}%`);
  }
  const rows = await db.all(`${APPOINTMENT_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY a.appointment_date, a.start_time, a.id LIMIT 1000`, params);
  return rows.map(mapAppointment);
}

/* ------------------------------------------------------------- write */

function normaliseTiming(input) {
  const date = String(input.date || input.appointmentDate || '').slice(0, 10);
  if (!isIsoDate(date)) throw httpError('Choose a valid appointment date');
  const start = toMinutes(input.startTime || input.start_time);
  if (start === null) throw httpError('Choose a valid start time');
  return { date, start };
}

/**
 * Create an appointment.
 *   staff (admin / cashier): status PENDING or CONFIRMED (default CONFIRMED); a confirmed
 *     booking must pass the schedule check (or an admin override).
 *   public website request: always PENDING unless instant confirmation is enabled AND a
 *     specific staff member's slot is clean — decided under the same lock.
 */
export async function createAppointment(db, user, input, { publicRequest = false } = {}) {
  const settings = await getSchedulingSettings(db);
  const idempotencyKey = cleanText(input.idempotencyKey || input.idempotency_key, '') || null;
  if (idempotencyKey) {
    const prior = await db.get('SELECT id FROM appointments WHERE idempotency_key = ?', [idempotencyKey]);
    if (prior) return { appointment: await getAppointment(db, prior.id), duplicate: true };
  }

  const customerName = cleanText(input.customerName || input.customer_name, '');
  if (!customerName) throw httpError('Customer name is required');
  const rawPhone = String(input.customerPhone || input.customer_phone || '').trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) throw httpError(PHONE_ERROR_MESSAGE);
  if (publicRequest && !phone) throw httpError('A valid phone number is required so the salon can confirm your booking');

  const { date, start } = normaliseTiming(input);
  const today = salonDateString();
  if (date < today) throw httpError('The appointment date is in the past');
  if (publicRequest && date > addDays(today, settings.maxDaysAhead)) throw httpError(`Online bookings are accepted up to ${settings.maxDaysAhead} days ahead`);
  if (date === today && start < nowMinutesNepal() && publicRequest) throw httpError('That time has already passed today');

  const source = publicRequest ? 'WEBSITE' : (APPOINTMENT_SOURCES.includes(input.source) ? input.source : 'STAFF');
  const staffId = Number(input.staffId || input.staff_id || 0) || null;
  const notes = cleanText(input.notes, null);

  return db.transaction(async (tx) => {
    await assertServiceStaff(tx, staffId);
    const lines = await resolveServiceLines(tx, input.services || input.serviceIds || []);
    const requestedServiceText = cleanText(input.requestedServiceText || input.requested_service_text, null);
    if (!lines.length && !requestedServiceText) throw httpError('Choose at least one service');
    const duration = lines.length ? lines.reduce((sum, line) => sum + line.duration, 0) : 30;
    const end = start + duration;
    if (end > 24 * 60) throw httpError('The appointment would run past midnight');

    await lockStaffDay(tx, staffId, date);

    let status = 'PENDING';
    let override = null;
    if (publicRequest) {
      if (start < settings.openMinutes || end > settings.closeMinutes) {
        throw httpError(`Please choose a time between ${settings.openTime} and ${settings.closeTime}`);
      }
      if (settings.instantConfirm && staffId) {
        const issues = await scheduleIssues(tx, { staffId, date, start, end, settings });
        const pendingClash = await findConflicts(tx, { staffId, date, start, end, includePending: true });
        if (!issues.length && !pendingClash.length) status = 'CONFIRMED';
      }
    } else {
      status = input.status === 'PENDING' ? 'PENDING' : 'CONFIRMED';
      if (status === 'CONFIRMED') {
        override = await assertSchedulable(tx, { staffId, date, start, end, settings, user, override: input.override });
      }
    }

    const customer = await findOrCreateCustomer(tx, { name: customerName, phone, create: !publicRequest });
    const number = await nextAppointmentNumber(tx);
    const result = await tx.run(`
      INSERT INTO appointments (
        appointment_number, customer_id, customer_name, customer_phone, appointment_date,
        start_time, end_time, duration_minutes, staff_id, status, source, notes,
        requested_service_text, requested_staff_text, conflict_override_reason, conflict_override_by,
        created_by, updated_by, confirmed_at, idempotency_key
      ) VALUES (?, ?, ?, ?, ?::date, ?::time, ?::time, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      number, customer?.id || null, customerName, phone, date,
      fromMinutes(start), fromMinutes(end), duration, staffId, status, source, notes,
      requestedServiceText, cleanText(input.requestedStaffText || input.requested_staff_text, null),
      override?.reason || null, override ? user.id : null,
      user?.id || null, user?.id || null, status === 'CONFIRMED' ? new Date().toISOString() : null, idempotencyKey,
    ]);
    const appointmentId = result.lastInsertRowid;
    for (const line of lines) {
      await tx.run(`
        INSERT INTO appointment_services (appointment_id, service_id, service_name, duration_minutes, price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [appointmentId, line.serviceId, line.name, line.duration, line.price, line.sortOrder]);
    }
    await recordEvent(tx, appointmentId, {
      type: 'created', to: status, actorId: user?.id || null,
      note: publicRequest ? 'Requested on the website' : `Booked by ${source.toLowerCase().replace('_', ' ')}`,
    });
    if (override) {
      await recordEvent(tx, appointmentId, { type: 'conflict_override', to: status, actorId: user.id, note: override.reason, details: { issues: override.issues } });
    }
    const waitlistId = Number(input.waitlistId || 0) || null;
    if (waitlistId) {
      await tx.run(`UPDATE appointment_waitlist SET status = 'BOOKED', appointment_id = ?, updated_at = NOW() WHERE id = ? AND status = 'WAITING'`, [appointmentId, waitlistId]);
    }
    return { appointmentId };
  }).then(async ({ appointmentId }) => ({ appointment: await getAppointment(db, appointmentId), duplicate: false }));
}

/** Edit / reschedule while the appointment is still PENDING or CONFIRMED. */
export async function updateAppointment(db, user, id, input) {
  const settings = await getSchedulingSettings(db);
  await db.transaction(async (tx) => {
    const current = await tx.get(`
      SELECT id, status, staff_id, appointment_date::text AS appointment_date, start_time::text AS start_time,
             end_time::text AS end_time, customer_name, customer_phone
      FROM appointments WHERE id = ? FOR UPDATE
    `, [id]);
    if (!current) throw httpError('Appointment not found', 404);
    if (!['PENDING', 'CONFIRMED'].includes(current.status)) throw httpError(`A ${current.status.toLowerCase().replace('_', ' ')} appointment cannot be edited`);

    const date = input.date ? String(input.date).slice(0, 10) : current.appointment_date;
    if (!isIsoDate(date)) throw httpError('Choose a valid appointment date');
    const start = input.startTime ? toMinutes(input.startTime) : toMinutes(current.start_time);
    if (start === null) throw httpError('Choose a valid start time');
    const staffId = input.staffId !== undefined ? Number(input.staffId || 0) || null : current.staff_id;
    await assertServiceStaff(tx, staffId);

    let lines = null;
    if (Array.isArray(input.services)) {
      lines = await resolveServiceLines(tx, input.services);
      if (!lines.length) throw httpError('Choose at least one service');
    }
    const existingDuration = (await tx.get('SELECT duration_minutes FROM appointments WHERE id = ?', [id])).duration_minutes;
    const duration = lines ? lines.reduce((sum, line) => sum + line.duration, 0) : Number(existingDuration);
    const end = start + duration;
    if (end > 24 * 60) throw httpError('The appointment would run past midnight');

    await lockStaffDay(tx, staffId, date);
    const override = current.status === 'CONFIRMED'
      ? await assertSchedulable(tx, { staffId, date, start, end, excludeId: id, settings, user, override: input.override })
      : null;

    const customerName = input.customerName !== undefined ? cleanText(input.customerName, '') : current.customer_name;
    if (!customerName) throw httpError('Customer name is required');
    let phone = current.customer_phone;
    if (input.customerPhone !== undefined) {
      const raw = String(input.customerPhone || '').trim();
      phone = raw ? normalizePhone(raw) : null;
      if (raw && !phone) throw httpError(PHONE_ERROR_MESSAGE);
    }
    const customer = await findOrCreateCustomer(tx, { name: customerName, phone, create: true });

    await tx.run(`
      UPDATE appointments
      SET appointment_date = ?::date, start_time = ?::time, end_time = ?::time, duration_minutes = ?,
          staff_id = ?, customer_name = ?, customer_phone = ?, customer_id = COALESCE(?, customer_id),
          notes = COALESCE(?, notes),
          conflict_override_reason = COALESCE(?, conflict_override_reason),
          conflict_override_by = COALESCE(?, conflict_override_by),
          updated_by = ?, updated_at = NOW()
      WHERE id = ?
    `, [date, fromMinutes(start), fromMinutes(end), duration, staffId, customerName, phone, customer?.id || null,
      input.notes !== undefined ? cleanText(input.notes, '') : null, override?.reason || null, override ? user.id : null, user.id, id]);
    if (lines) {
      await tx.run('DELETE FROM appointment_services WHERE appointment_id = ?', [id]);
      for (const line of lines) {
        await tx.run(`
          INSERT INTO appointment_services (appointment_id, service_id, service_name, duration_minutes, price, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [id, line.serviceId, line.name, line.duration, line.price, line.sortOrder]);
      }
    }
    const moved = date !== current.appointment_date || fromMinutes(start) !== String(current.start_time).slice(0, 5) || staffId !== current.staff_id;
    await recordEvent(tx, id, {
      type: moved ? 'rescheduled' : 'edited', from: current.status, to: current.status, actorId: user.id,
      details: moved ? { from: { date: current.appointment_date, start: String(current.start_time).slice(0, 5), staffId: current.staff_id }, to: { date, start: fromMinutes(start), staffId } } : null,
    });
    if (override) await recordEvent(tx, id, { type: 'conflict_override', actorId: user.id, note: override.reason, details: { issues: override.issues } });
  });
  return getAppointment(db, id);
}

/**
 * Move an appointment through its lifecycle. check_in may also issue a walk-in token (store
 * must be open) so the customer joins the same queue as walk-ins.
 */
export async function transitionAppointment(db, user, id, action, options = {}) {
  const rule = TRANSITIONS[action];
  if (!rule) throw httpError('Unknown appointment action');
  const settings = await getSchedulingSettings(db);
  const reason = cleanText(options.reason, '');
  if (rule.needsReason && !reason) throw httpError('A reason is required');

  const scope = action === 'check_in' && options.createToken ? await requireOpenSession(db) : null;

  const released = await db.transaction(async (tx) => {
    const current = await tx.get(`
      SELECT id, status, staff_id, token_id, customer_id, customer_name, customer_phone,
             appointment_date::text AS appointment_date, start_time::text AS start_time, end_time::text AS end_time
      FROM appointments WHERE id = ? FOR UPDATE
    `, [id]);
    if (!current) throw httpError('Appointment not found', 404);
    if (!rule.from.includes(current.status)) {
      throw httpError(`Cannot mark a ${current.status.toLowerCase().replace('_', ' ')} appointment as ${rule.label.toLowerCase()}`, 409);
    }
    // Arrival and service happen on the day: a future booking cannot be checked in, started,
    // completed or marked no-show ahead of time.
    if (['check_in', 'start', 'complete', 'no_show'].includes(action) && current.appointment_date > salonDateString()) {
      throw httpError(`This appointment is on ${current.appointment_date}. It can be ${rule.label.toLowerCase()} on or after that day.`, 409);
    }
    // Service staff may only move their own appointments through service (start / complete).
    if (SERVICE_STAFF_ROLES.includes(user.role)) {
      if (!['start', 'complete'].includes(action) || String(current.staff_id) !== String(user.id)) {
        throw httpError('You can only start or complete your own appointments', 403);
      }
    }

    let override = null;
    if (action === 'confirm') {
      await lockStaffDay(tx, current.staff_id, current.appointment_date);
      override = await assertSchedulable(tx, {
        staffId: current.staff_id, date: current.appointment_date,
        start: toMinutes(current.start_time), end: toMinutes(current.end_time),
        excludeId: id, settings, user, override: options.override,
      });
    }

    let tokenId = current.token_id;
    if (scope && !tokenId) {
      const firstService = await tx.get('SELECT service_id FROM appointment_services WHERE appointment_id = ? AND service_id IS NOT NULL ORDER BY sort_order, id LIMIT 1', [id]);
      if (!firstService) throw httpError('Add a service before issuing a token');
      const token = await createWalkInToken(tx, {
        serviceId: firstService.service_id, staffId: current.staff_id, customerId: current.customer_id,
        customerName: current.customer_name, customerPhone: current.customer_phone || '',
        notes: `Appointment check-in`, userId: user.id, sessionId: scope.sessionId, businessDayId: scope.businessDayId,
      });
      tokenId = token.id;
    }

    await tx.run(`
      UPDATE appointments
      SET status = ?, ${rule.stamp} = NOW(), token_id = ?,
          cancel_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancel_reason END,
          conflict_override_reason = COALESCE(?, conflict_override_reason),
          conflict_override_by = COALESCE(?, conflict_override_by),
          updated_by = ?, updated_at = NOW()
      WHERE id = ?
    `, [rule.to, tokenId, rule.to, reason || null, override?.reason || null, override ? user.id : null, user.id, id]);
    await recordEvent(tx, id, { type: action, from: current.status, to: rule.to, actorId: user.id, note: reason || null, details: tokenId && tokenId !== current.token_id ? { tokenId } : null });
    if (override) await recordEvent(tx, id, { type: 'conflict_override', actorId: user.id, note: override.reason, details: { issues: override.issues } });
    return ['CANCELLED', 'NO_SHOW'].includes(rule.to) ? current : null;
  });

  const appointment = await getAppointment(db, id);
  // A freed slot surfaces matching waitlisted customers — the salon decides, nothing auto-books.
  const waitlistMatches = released ? await matchingWaitlist(db, { date: released.appointment_date, staffId: released.staff_id }) : [];
  return { appointment, waitlistMatches };
}

/**
 * Link the bill that settles an appointment. Runs inside the billing transaction, so the bill
 * and the link succeed or fail together; the unique paid-bill index is the final guard.
 */
export async function linkAppointmentToBill(tx, appointmentId, billId, userId) {
  const appointment = await tx.get('SELECT id, status FROM appointments WHERE id = ? FOR UPDATE', [appointmentId]);
  if (!appointment) throw httpError('The appointment for this bill was not found', 404);
  if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) throw httpError('A cancelled or no-show appointment cannot be billed', 409);
  const existing = await tx.get(`
    SELECT bill_number FROM salon_bills
    WHERE appointment_id = ? AND id <> ? AND LOWER(COALESCE(status, '')) IN ('paid', 'completed')
  `, [appointmentId, billId]);
  if (existing) throw httpError(`This appointment is already billed (${existing.bill_number})`, 409, { code: 'APPOINTMENT_ALREADY_BILLED' });
  await tx.run('UPDATE salon_bills SET appointment_id = ? WHERE id = ?', [appointmentId, billId]);
  await tx.run(`
    UPDATE appointments SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW()), updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `, [userId, appointmentId]);
  await recordEvent(tx, appointmentId, { type: 'billed', from: appointment.status, to: 'COMPLETED', actorId: userId, details: { billId } });
}

/* -------------------------------------------------------- availability */

/**
 * Bookable start times for a date. publicMode also treats PENDING requests as busy and hides
 * past times, so the website never offers a slot the salon is already considering.
 */
export async function getAvailability(db, { date, serviceIds = [], staffId = null, publicMode = false }) {
  if (!isIsoDate(date)) throw httpError('Choose a valid date');
  const settings = await getSchedulingSettings(db);
  const today = salonDateString();
  if (date < today) return { date, durationMinutes: 0, slotMinutes: settings.slotMinutes, staff: [], anyStaff: [] };
  const lines = await resolveServiceLines(db, serviceIds);
  const duration = lines.length ? lines.reduce((sum, line) => sum + line.duration, 0) : 30;

  const staffRows = await db.all(`
    SELECT u.id, COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS name, sp.salon_role
    FROM users u JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.is_active = TRUE AND sp.salon_role IN (${SERVICE_STAFF_SQL}) ${staffId ? 'AND u.id = ?' : ''}
    ORDER BY name
  `, staffId ? [staffId] : []);

  const nowMinutes = date === today ? nowMinutesNepal() : -1;
  const staff = [];
  for (const member of staffRows) {
    const hours = await getStaffHours(db, member.id, date, settings);
    if (hours.off) { staff.push({ id: member.id, name: member.name, role: member.salon_role, off: true, slots: [] }); continue; }
    const timeOff = await getTimeOff(db, member.id, date);
    const busy = (await db.all(`
      SELECT start_time::text AS start_time, end_time::text AS end_time FROM appointments
      WHERE staff_id = ? AND appointment_date = ?::date AND status IN (${(publicMode ? [...BLOCKING_STATUSES, 'PENDING'] : BLOCKING_STATUSES).map(() => '?').join(',')})
    `, [member.id, date, ...(publicMode ? [...BLOCKING_STATUSES, 'PENDING'] : BLOCKING_STATUSES)]))
      .map((row) => ({ start: toMinutes(row.start_time), end: toMinutes(row.end_time) }));
    const blocked = [...busy, ...timeOff];
    const slots = [];
    for (let start = hours.start; start + duration <= hours.end; start += settings.slotMinutes) {
      if (start <= nowMinutes) continue;
      const end = start + duration;
      if (!blocked.some((block) => start < block.end && end > block.start)) slots.push(fromMinutes(start));
    }
    staff.push({ id: member.id, name: member.name, role: member.salon_role, off: false, slots });
  }
  const anyStaff = [...new Set(staff.flatMap((member) => member.slots))].sort();
  return { date, durationMinutes: duration, slotMinutes: settings.slotMinutes, staff, anyStaff };
}

/* ------------------------------------------------------------- waitlist */

export async function addToWaitlist(db, user, input) {
  const name = cleanText(input.customerName, '');
  if (!name) throw httpError('Customer name is required');
  const raw = String(input.customerPhone || '').trim();
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) throw httpError(PHONE_ERROR_MESSAGE);
  const date = String(input.requestedDate || '').slice(0, 10);
  if (!isIsoDate(date)) throw httpError('Choose a requested date');
  const flexibility = ['EXACT', 'SAME_DAY', 'ANY_DAY'].includes(input.flexibility) ? input.flexibility : 'SAME_DAY';
  return db.transaction(async (tx) => {
    const customer = await findOrCreateCustomer(tx, { name, phone, create: true });
    const serviceId = Number(input.serviceId || 0) || null;
    const staffId = Number(input.preferredStaffId || 0) || null;
    if (serviceId) await resolveServiceLines(tx, [serviceId]);
    await assertServiceStaff(tx, staffId);
    const result = await tx.run(`
      INSERT INTO appointment_waitlist (customer_id, customer_name, customer_phone, requested_date, preferred_time,
        preferred_staff_id, service_id, flexibility, priority, notes, created_by)
      VALUES (?, ?, ?, ?::date, ?, ?, ?, ?, ?, ?, ?)
    `, [customer?.id || null, name, phone, date, cleanText(input.preferredTime, null), staffId, serviceId, flexibility,
      Math.min(9, Math.max(0, Number(input.priority) || 0)), cleanText(input.notes, null), user.id]);
    return result.lastInsertRowid;
  });
}

const WAITLIST_SELECT = `
  SELECT w.id, w.customer_id, w.customer_name, w.customer_phone, w.requested_date::text AS requested_date,
         w.preferred_time, w.preferred_staff_id, w.service_id, w.flexibility, w.priority, w.notes, w.status,
         w.appointment_id, w.created_at, s.name AS service_name,
         COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS preferred_staff_name
  FROM appointment_waitlist w
  LEFT JOIN salon_services s ON s.id = w.service_id
  LEFT JOIN users u ON u.id = w.preferred_staff_id
  LEFT JOIN staff_profiles sp ON sp.user_id = w.preferred_staff_id
`;

function mapWaitlist(row) {
  return {
    id: row.id, customerId: row.customer_id, customerName: row.customer_name, customerPhone: row.customer_phone,
    requestedDate: row.requested_date, preferredTime: row.preferred_time, preferredStaffId: row.preferred_staff_id,
    preferredStaffName: row.preferred_staff_name, serviceId: row.service_id, serviceName: row.service_name,
    flexibility: row.flexibility, priority: Number(row.priority || 0), notes: row.notes, status: row.status,
    appointmentId: row.appointment_id, createdAt: row.created_at,
  };
}

export async function listWaitlist(db, { from, to } = {}) {
  const start = isIsoDate(from) ? from : salonDateString();
  const end = isIsoDate(to) ? to : addDays(start, 30);
  const rows = await db.all(`
    ${WAITLIST_SELECT}
    WHERE w.status = 'WAITING' AND (w.requested_date BETWEEN ?::date AND ?::date OR w.flexibility = 'ANY_DAY')
    ORDER BY w.priority DESC, w.requested_date, w.created_at
    LIMIT 200
  `, [start, end]);
  return rows.map(mapWaitlist);
}

/** Waitlisted customers who could take a slot freed on this date (optionally this staff). */
export async function matchingWaitlist(db, { date, staffId }) {
  const rows = await db.all(`
    ${WAITLIST_SELECT}
    WHERE w.status = 'WAITING'
      AND (w.requested_date = ?::date OR w.flexibility = 'ANY_DAY')
      AND (w.preferred_staff_id IS NULL OR w.preferred_staff_id = ?)
    ORDER BY w.priority DESC, w.created_at
    LIMIT 10
  `, [date, staffId || 0]);
  return rows.map(mapWaitlist);
}

export async function removeFromWaitlist(db, user, id) {
  const result = await db.run(`UPDATE appointment_waitlist SET status = 'REMOVED', updated_at = NOW() WHERE id = ? AND status = 'WAITING'`, [id]);
  if (!result.rowCount) throw httpError('Waitlist entry not found', 404);
}

/* ------------------------------------------------------ staff hours */

export async function getStaffSchedule(db) {
  const settings = await getSchedulingSettings(db);
  const staff = await db.all(`
    SELECT u.id, COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS name, sp.salon_role
    FROM users u JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.is_active = TRUE AND sp.salon_role IN (${SERVICE_STAFF_SQL})
    ORDER BY name
  `);
  const hours = await db.all('SELECT staff_id, weekday, is_off, start_time::text AS start_time, end_time::text AS end_time FROM staff_working_hours');
  const timeOff = await db.all(`
    SELECT t.id, t.staff_id, t.starts_at, t.ends_at, t.reason FROM staff_time_off t
    WHERE t.ends_at > NOW() - INTERVAL '1 day' ORDER BY t.starts_at LIMIT 200
  `);
  return {
    settings,
    staff: staff.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.salon_role,
      week: Array.from({ length: 7 }, (_, weekday) => {
        const row = hours.find((item) => String(item.staff_id) === String(member.id) && Number(item.weekday) === weekday);
        return row
          ? { weekday, custom: true, isOff: Boolean(row.is_off), start: row.start_time?.slice(0, 5) || null, end: row.end_time?.slice(0, 5) || null }
          : { weekday, custom: false, isOff: false, start: settings.openTime, end: settings.closeTime };
      }),
    })),
    timeOff: timeOff.map((row) => ({ id: row.id, staffId: row.staff_id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason })),
  };
}

export async function saveStaffWeek(db, user, staffId, week) {
  await assertServiceStaff(db, staffId);
  if (!Array.isArray(week) || week.length !== 7) throw httpError('Provide all seven days');
  await db.transaction(async (tx) => {
    for (const day of week) {
      const weekday = Number(day.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw httpError('Invalid weekday');
      const start = day.isOff ? null : toMinutes(day.start);
      const end = day.isOff ? null : toMinutes(day.end);
      if (!day.isOff && (start === null || end === null || end <= start)) throw httpError('Each working day needs a start time before its end time');
      await tx.run(`
        INSERT INTO staff_working_hours (staff_id, weekday, is_off, start_time, end_time, updated_by, updated_at)
        VALUES (?, ?, ?, ?::time, ?::time, ?, NOW())
        ON CONFLICT (staff_id, weekday) DO UPDATE SET is_off = EXCLUDED.is_off, start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        RETURNING staff_id
      `, [staffId, weekday, Boolean(day.isOff), day.isOff ? null : fromMinutes(start), day.isOff ? null : fromMinutes(end), user.id]);
    }
  });
}

export async function addTimeOff(db, user, { staffId, startsAt, endsAt, reason }) {
  await assertServiceStaff(db, Number(staffId));
  const from = new Date(startsAt);
  const to = new Date(endsAt);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw httpError('Choose a valid start and end');
  const result = await db.run(`
    INSERT INTO staff_time_off (staff_id, starts_at, ends_at, reason, created_by) VALUES (?, ?, ?, ?, ?)
  `, [Number(staffId), from.toISOString(), to.toISOString(), cleanText(reason, null), user.id]);
  return result.lastInsertRowid;
}

export async function removeTimeOff(db, id) {
  await db.run('DELETE FROM staff_time_off WHERE id = ?', [id]);
}

export async function saveSchedulingSettings(db, input) {
  const updates = {};
  if (input.openTime !== undefined) { if (toMinutes(input.openTime) === null) throw httpError('Invalid opening time'); updates.salon_open_time = fromMinutes(toMinutes(input.openTime)); }
  if (input.closeTime !== undefined) { if (toMinutes(input.closeTime) === null) throw httpError('Invalid closing time'); updates.salon_close_time = fromMinutes(toMinutes(input.closeTime)); }
  if (updates.salon_open_time && updates.salon_close_time && updates.salon_close_time <= updates.salon_open_time) throw httpError('Closing time must be after opening time');
  if (input.slotMinutes !== undefined) updates.appointment_slot_minutes = String(Math.min(60, Math.max(5, Number(input.slotMinutes) || 15)));
  if (input.onlineBookingEnabled !== undefined) updates.online_booking_enabled = input.onlineBookingEnabled ? 'true' : 'false';
  if (input.instantConfirm !== undefined) updates.online_booking_instant_confirm = input.instantConfirm ? 'true' : 'false';
  if (input.maxDaysAhead !== undefined) updates.online_booking_max_days_ahead = String(Math.min(180, Math.max(1, Number(input.maxDaysAhead) || 30)));
  for (const [key, value] of Object.entries(updates)) {
    await db.run(`
      INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
    `, [key, value]);
  }
  return getSchedulingSettings(db);
}

export { ACTIVE_STATUSES };
