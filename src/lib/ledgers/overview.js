/**
 * Ledger overview for the Customer Ledger and Supplier Ledger pages:
 *   - who owes / is owed now, with the balance aged by the date of each open bill / invoice
 *     (0–30, 31–60, 61–90, over 90 days). Ages come from the same oldest-first allocation the
 *     profiles use, so the buckets always add up to the total outstanding;
 *   - "history": everyone with ledger activity in a date range, with what was added / removed.
 * All money is summed here.
 */
import { getCustomerProfile, listCustomerBalances } from '@/lib/customers/profile';
import { getSupplierProfile } from '@/lib/suppliers/profile';
import { listSuppliers } from '@/lib/suppliers/service';

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const EPS = 0.005;
const BUCKETS = [
  { key: 'd0_30', label: '0–30 days', max: 30 },
  { key: 'd31_60', label: '31–60 days', max: 60 },
  { key: 'd61_90', label: '61–90 days', max: 90 },
  { key: 'd90', label: 'Over 90 days', max: Infinity },
];

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}

function nepalDate(value) {
  if (!value) return null;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = value instanceof Date ? value : new Date(text);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(date);
}

const ageDays = (fromIso, toIso) => Math.max(0, Math.round((new Date(`${toIso}T12:00:00Z`) - new Date(`${fromIso}T12:00:00Z`)) / 86400000));

/** Adds each open amount to its age bucket; returns the per-row oldest age too. */
function ageing(openItems, today) {
  const sums = Object.fromEntries(BUCKETS.map((bucket) => [bucket.key, 0]));
  let oldest = 0;
  for (const item of openItems) {
    const days = item.date ? ageDays(item.date, today) : 0;
    oldest = Math.max(oldest, days);
    const bucket = BUCKETS.find((entry) => days <= entry.max);
    sums[bucket.key] += item.open;
  }
  return { sums, oldest };
}

function summarise(rows, today) {
  const totals = Object.fromEntries(BUCKETS.map((bucket) => [bucket.key, 0]));
  for (const row of rows) for (const bucket of BUCKETS) totals[bucket.key] += row.buckets[bucket.key] || 0;
  const outstanding = round2(rows.reduce((sum, row) => sum + row.balance, 0));
  return {
    outstanding,
    count: rows.length,
    asOf: today,
    ageing: BUCKETS.map((bucket) => ({
      key: bucket.key, label: bucket.label, amount: round2(totals[bucket.key]),
      share: outstanding > 0 ? Math.round((totals[bucket.key] / outstanding) * 1000) / 10 : 0,
    })),
  };
}

function inRange(date, from, to) {
  const day = nepalDate(date);
  return day && (!from || day >= from) && (!to || day <= to);
}

export async function customerLedgerOverview(db, { q = '', from = '', to = '' } = {}) {
  const today = nepalToday();
  const { customers } = await listCustomerBalances(db, { q });
  const owing = customers.filter((row) => row.balance > EPS);
  const outstanding = [];
  for (const row of owing) {
    const profile = await getCustomerProfile(db, row.id);
    const billDates = new Map((profile.bills || []).map((bill) => [String(bill.id), nepalDate(bill.createdAt)]));
    const open = (profile.openInvoices || []).map((item) => ({ open: Number(item.open), date: billDates.get(String(item.billId)) }));
    // Any balance not tied to a bill (e.g. a manual adjustment) ages from the last activity.
    const unallocated = round2(row.balance - open.reduce((sum, item) => sum + item.open, 0));
    if (unallocated > EPS) open.push({ open: unallocated, date: nepalDate(row.lastActivity) });
    const { sums, oldest } = ageing(open, today);
    outstanding.push({
      id: row.id, name: row.name, phone: row.phone, balance: row.balance, openBills: profile.openInvoices?.length || 0,
      oldestDays: oldest, lastActivity: row.lastActivity, buckets: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, round2(v)])),
    });
  }

  let history = [];
  if (from || to) {
    const params = [];
    let where = '1=1';
    if (from) { where += " AND (l.created_at AT TIME ZONE 'Asia/Kathmandu')::date >= ?::date"; params.push(from); }
    if (to) { where += " AND (l.created_at AT TIME ZONE 'Asia/Kathmandu')::date <= ?::date"; params.push(to); }
    const search = String(q || '').trim();
    if (search) { where += ' AND (c.name ILIKE ? OR c.phone ILIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    const rows = await db.all(`
      SELECT c.id, c.name, c.phone, COALESCE(SUM(l.debit), 0) AS added, COALESCE(SUM(l.credit), 0) AS removed, COUNT(*)::int AS entries,
             MAX(l.created_at) AS last_activity,
             (SELECT COALESCE(SUM(x.debit - x.credit), 0) FROM customer_credit_ledger x WHERE x.customer_id = c.id) AS balance
      FROM customer_credit_ledger l JOIN customers c ON c.id = l.customer_id
      WHERE ${where}
      GROUP BY c.id, c.name, c.phone ORDER BY last_activity DESC LIMIT 1000
    `, params);
    history = rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, added: round2(row.added), removed: round2(row.removed), entries: row.entries, balance: round2(row.balance), lastActivity: row.last_activity }));
  }
  return {
    ...summarise(outstanding, today),
    outstandingRows: outstanding.sort((a, b) => b.balance - a.balance),
    history,
    period: { from: from || null, to: to || null },
  };
}

export async function supplierLedgerOverview(db, { q = '', from = '', to = '' } = {}) {
  const today = nepalToday();
  const { suppliers } = await listSuppliers(db, { includeInactive: true, q });
  const outstanding = [];
  const history = [];
  for (const supplier of suppliers) {
    const needsProfile = supplier.balance > EPS || from || to;
    if (!needsProfile) continue;
    const profile = await getSupplierProfile(db, supplier.id);
    if (supplier.balance > EPS) {
      const purchaseDates = new Map((profile.purchases || []).map((purchase) => [String(purchase.id), nepalDate(purchase.date)]));
      const addedOn = nepalDate(profile.supplier?.createdAt);
      const open = (profile.openInvoices || []).map((item) => ({ open: Number(item.open), date: item.purchaseId ? purchaseDates.get(String(item.purchaseId)) : addedOn }));
      const { sums, oldest } = ageing(open, today);
      outstanding.push({
        id: supplier.id, name: supplier.name, phone: supplier.phone, contactPerson: supplier.contactPerson, balance: round2(supplier.balance),
        openBills: profile.openInvoices?.length || 0, oldestDays: oldest, lastActivity: supplier.lastPurchaseDate || null,
        buckets: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, round2(v)])),
      });
    }
    if (from || to) {
      const entries = (profile.entries || []).filter((entry) => inRange(entry.date || entry.createdAt, from, to));
      if (entries.length) {
        history.push({
          id: supplier.id, name: supplier.name, phone: supplier.phone, entries: entries.length,
          added: round2(entries.reduce((sum, entry) => sum + Number(entry.owedIncrease || 0), 0)),
          removed: round2(entries.reduce((sum, entry) => sum + Number(entry.owedDecrease || 0), 0)),
          balance: round2(supplier.balance),
          lastActivity: entries.map((entry) => entry.date || entry.createdAt).sort().pop(),
        });
      }
    }
  }
  return {
    ...summarise(outstanding, today),
    outstandingRows: outstanding.sort((a, b) => b.balance - a.balance),
    history: history.sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity))),
    period: { from: from || null, to: to || null },
  };
}
