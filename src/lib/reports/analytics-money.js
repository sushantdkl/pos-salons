/**
 * Extra Analytics blocks for the owner dashboard: where sales came from (walk-in / token /
 * appointment), payment summary by bill method, hour and weekday patterns, bill-level payment
 * records, and the cancellations & changes lists. Same scope rules as analytics.js (revenue
 * scope for bills; 'today' follows the Business Day). Every sum is computed here.
 */
import { periodDateColumnFilter, SALON_TIMEZONE } from '@/lib/db/postgres-dates';
import { eventScope, numeric, PAID_BILL_STATUS_SQL, revenueScope } from '@/lib/reports/finance-summary';
import { listSuppliers } from '@/lib/suppliers/service';

const round2 = (value) => Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
const pct = (part, whole) => (numeric(whole) > 0 ? Math.round((numeric(part) / numeric(whole)) * 1000) / 10 : 0);
const LOCAL = (column) => `((${column}) AT TIME ZONE '${SALON_TIMEZONE}')`;
const BILL_TIME = 'COALESCE(b.transaction_time, b.created_at)';
const RECORD_CAP = 2000;

const alloc = (method) => `(SELECT COALESCE(SUM(a.amount), 0) FROM salon_payment_allocations a WHERE a.bill_id = b.id AND a.method = '${method}')`;

async function getSources(db, bills) {
  const rows = await db.all(`
    SELECT CASE WHEN b.appointment_id IS NOT NULL THEN 'appointment' WHEN b.token_id IS NOT NULL THEN 'token' ELSE 'walkin' END AS source,
           COUNT(*)::int AS bills,
           COALESCE(SUM(b.subtotal), 0) AS gross,
           COALESCE(SUM(b.grand_total), 0) AS total,
           COALESCE(SUM((SELECT COALESCE(SUM(i.quantity), 0) FROM salon_bill_items i WHERE i.bill_id = b.id AND i.item_type <> 'product')), 0)::int AS services
    FROM salon_bills b
    WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL}
    GROUP BY 1
  `, bills.params);
  const by = Object.fromEntries(rows.map((row) => [row.source, row]));
  const total = rows.reduce((sum, row) => sum + numeric(row.total), 0);
  const list = ['walkin', 'token', 'appointment'].map((key) => ({
    key,
    label: { walkin: 'Walk-in (direct bill)', token: 'Token queue', appointment: 'Appointment' }[key],
    bills: Number(by[key]?.bills || 0),
    services: Number(by[key]?.services || 0),
    gross: round2(by[key]?.gross),
    total: round2(by[key]?.total),
    share: pct(by[key]?.total, total),
  }));
  return {
    rows: list,
    totals: {
      bills: list.reduce((sum, row) => sum + row.bills, 0),
      services: list.reduce((sum, row) => sum + row.services, 0),
      gross: round2(list.reduce((sum, row) => sum + row.gross, 0)),
      total: round2(total),
    },
  };
}

async function getPaymentSummary(db, bills) {
  const rows = await db.all(`
    SELECT b.payment_method AS method, COUNT(*)::int AS bills, COALESCE(SUM(b.grand_total), 0) AS total,
           COALESCE(SUM(${alloc('cash')}), 0) AS cash, COALESCE(SUM(${alloc('online')}), 0) AS online, COALESCE(SUM(${alloc('credit')}), 0) AS credit
    FROM salon_bills b
    WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL}
    GROUP BY b.payment_method
  `, bills.params);
  const by = Object.fromEntries(rows.map((row) => [row.method, row]));
  const line = (key) => ({ bills: Number(by[key]?.bills || 0), total: round2(by[key]?.total), cash: round2(by[key]?.cash), online: round2(by[key]?.online), credit: round2(by[key]?.credit) });
  const summary = { cash: line('cash'), online: line('online'), split: line('split'), credit: line('credit') };
  summary.receivedBills = summary.cash.bills + summary.online.bills + summary.split.bills;
  return summary;
}

async function getPatterns(db, bills) {
  const [hours, weekdays] = await Promise.all([
    db.all(`
      SELECT EXTRACT(HOUR FROM ${LOCAL(BILL_TIME)})::int AS hour, COUNT(*)::int AS bills, COALESCE(SUM(b.grand_total), 0) AS total
      FROM salon_bills b WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL} GROUP BY 1 ORDER BY 1
    `, bills.params),
    db.all(`
      SELECT EXTRACT(ISODOW FROM ${LOCAL(BILL_TIME)})::int AS dow, COUNT(*)::int AS bills, COALESCE(SUM(b.grand_total), 0) AS total,
             COUNT(DISTINCT ${LOCAL(BILL_TIME)}::date)::int AS days
      FROM salon_bills b WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL} GROUP BY 1 ORDER BY 1
    `, bills.params),
  ]);
  const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;
  const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Nepal's week starts on Sunday.
  const order = [7, 1, 2, 3, 4, 5, 6];
  const byDow = Object.fromEntries(weekdays.map((row) => [row.dow, row]));
  return {
    byHour: hours.map((row) => ({ hour: row.hour, label: hourLabel(row.hour), bills: row.bills, total: round2(row.total) })),
    byWeekday: order.map((dow) => ({
      label: names[dow],
      bills: Number(byDow[dow]?.bills || 0),
      total: round2(byDow[dow]?.total),
      average: byDow[dow]?.days ? round2(numeric(byDow[dow].total) / Number(byDow[dow].days)) : 0,
    })),
  };
}

async function getPaymentRecords(db, bills) {
  const rows = await db.all(`
    SELECT b.id, b.bill_number, ${BILL_TIME} AS time, COALESCE(NULLIF(b.customer_name, ''), 'Walk-in Customer') AS customer, b.customer_id,
           b.payment_method AS method, b.status, b.grand_total AS total,
           ${alloc('cash')} AS cash, ${alloc('online')} AS online, ${alloc('credit')} AS credit
    FROM salon_bills b
    WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL}
    ORDER BY ${BILL_TIME} DESC, b.id DESC
    LIMIT ${RECORD_CAP + 1}
  `, bills.params);
  const records = rows.slice(0, RECORD_CAP).map((row) => ({
    ...row, total: round2(row.total), cash: round2(row.cash), online: round2(row.online), credit: round2(row.credit),
  }));
  return { records, truncated: rows.length > RECORD_CAP };
}

async function getCancellations(db, period, scope, bills) {
  const voidScope = eventScope('fc', period, scope);
  const tokenScope = scope.businessDayId
    ? { clause: 'wt.business_day_id = ?', params: [scope.businessDayId] }
    : periodDateColumnFilter(period, 'wt.token_date', scope.startDate, scope.endDate);
  const apptScope = periodDateColumnFilter(period, 'ap.appointment_date', scope.startDate, scope.endDate);
  const [voids, tokens, appointments, discounts, backdated] = await Promise.all([
    db.all(`
      SELECT fc.id, fc.created_at AS time, fc.amount, fc.reason, b.id AS bill_id, b.bill_number, COALESCE(NULLIF(b.customer_name, ''), 'Walk-in Customer') AS customer,
             COALESCE(u.full_name, u.username, '') AS by_name
      FROM financial_corrections fc
      LEFT JOIN salon_bills b ON b.id = fc.source_id
      LEFT JOIN users u ON u.id = fc.created_by
      WHERE fc.source_type = 'salon_bill' AND fc.correction_type = 'void' AND ${voidScope.clause}
      ORDER BY fc.created_at DESC LIMIT 500
    `, voidScope.params),
    db.all(`
      SELECT wt.id, wt.token_number, wt.token_date::text AS date, COALESCE(wt.cancelled_at, wt.no_show_at, wt.updated_at) AS time, wt.status,
             COALESCE(NULLIF(wt.customer_name, ''), 'Walk-in') AS customer, wt.notes
      FROM walk_in_tokens wt
      WHERE wt.status IN ('CANCELLED', 'NO_SHOW') AND ${tokenScope.clause}
      ORDER BY time DESC LIMIT 500
    `, tokenScope.params),
    db.all(`
      SELECT ap.id, ap.appointment_number, to_char(ap.appointment_date, 'YYYY-MM-DD') AS date, ap.start_time::text AS start_time, ap.status,
             COALESCE(NULLIF(ap.customer_name, ''), 'Customer') AS customer, ap.customer_id, ap.cancel_reason AS reason, ap.source,
             COALESCE(s.full_name, '') AS staff
      FROM appointments ap LEFT JOIN users s ON s.id = ap.staff_id
      WHERE ap.status IN ('CANCELLED', 'NO_SHOW') AND ${apptScope.clause}
      ORDER BY ap.appointment_date DESC, ap.start_time DESC LIMIT 500
    `, apptScope.params),
    db.all(`
      SELECT b.id, b.bill_number, ${BILL_TIME} AS time, COALESCE(NULLIF(b.customer_name, ''), 'Walk-in Customer') AS customer,
             b.subtotal, b.discount_amount AS discount, COALESCE(b.loyalty_discount, 0) AS loyalty, b.grand_total AS total,
             ROUND(100 * b.discount_amount / NULLIF(b.subtotal, 0), 1) AS rate
      FROM salon_bills b
      WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL} AND COALESCE(b.discount_amount, 0) > 0
      ORDER BY ${BILL_TIME} DESC LIMIT 500
    `, bills.params),
    db.all(`
      SELECT b.id, b.bill_number, ${BILL_TIME} AS time, b.created_at AS entered_at, COALESCE(NULLIF(b.customer_name, ''), 'Walk-in Customer') AS customer,
             b.grand_total AS total, b.backdated_reason AS reason, COALESCE(u.full_name, u.username, '') AS by_name
      FROM salon_bills b LEFT JOIN users u ON u.id = b.backdated_by
      WHERE ${bills.clause} AND ${PAID_BILL_STATUS_SQL} AND b.backdated_by IS NOT NULL
      ORDER BY ${BILL_TIME} DESC LIMIT 500
    `, bills.params),
  ]);
  const money = (rows, keys) => rows.map((row) => ({ ...row, ...Object.fromEntries(keys.map((key) => [key, round2(row[key])])) }));
  return {
    voids: money(voids, ['amount']),
    tokens,
    appointments,
    discounts: money(discounts, ['subtotal', 'discount', 'loyalty', 'total', 'rate']),
    backdated: money(backdated, ['total']),
    totals: {
      voidedAmount: round2(voids.reduce((sum, row) => sum + numeric(row.amount), 0)),
      discountAmount: round2(discounts.reduce((sum, row) => sum + numeric(row.discount), 0)),
      loyaltyAmount: round2(discounts.reduce((sum, row) => sum + numeric(row.loyalty), 0)),
      cancelledTokens: tokens.filter((row) => row.status === 'CANCELLED').length,
      noShowTokens: tokens.filter((row) => row.status === 'NO_SHOW').length,
      cancelledAppointments: appointments.filter((row) => row.status === 'CANCELLED').length,
      noShowAppointments: appointments.filter((row) => row.status === 'NO_SHOW').length,
    },
  };
}

export async function getAnalyticsExtras(db, period, scope) {
  const bills = revenueScope('b', period, scope);
  const [sources, paymentSummary, patterns, paymentRecords, cancellations, suppliers] = await Promise.all([
    getSources(db, bills),
    getPaymentSummary(db, bills),
    getPatterns(db, bills),
    getPaymentRecords(db, bills),
    getCancellations(db, period, scope, bills),
    listSuppliers(db),
  ]);
  return { sources: sources.rows, sourceTotals: sources.totals, paymentSummary, ...patterns, paymentRecords, cancellations, payables: suppliers.totals.payable };
}
