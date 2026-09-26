/**
 * Report workspace: every report is a set of tables for one period and one set of filters.
 * All sums, shares and totals are computed here (SQL + server-side rounding); the page only
 * searches, sorts, pages and formats.
 *
 * Filters: basis (calendar | business), staff (bill-line staff / employee), method, category.
 */
import { PAID_BILL_STATUS_SQL, SALARY_EXPENSE_CATEGORIES } from '@/lib/reports/finance-summary';

const ROW_CAP = 5000;
const OPERATING_EXPENSE_SQL = `e.deleted_at IS NULL AND COALESCE(e.record_type,'EXPENSE')='EXPENSE' AND e.category NOT IN (${SALARY_EXPENSE_CATEGORIES.map((c) => `'${c}'`).join(',')})`;
const round = (value) => Number(Number(value || 0).toFixed(2));

/** Money / count columns summed for each table's TOTAL row. */
const TOTAL_KEYS = {
  invoices: ['subtotal', 'discount', 'cash', 'online', 'credit', 'total'],
  methods: ['transactions', 'count', 'amount', 'share'],
  categories: ['quantity', 'count', 'amount', 'share'],
  daily: ['bills', 'services', 'units', 'count', 'gross', 'discount', 'amount', 'cash', 'online', 'credit', 'revenue', 'commission', 'cost', 'profit'],
  items: ['quantity', 'revenue', 'commission', 'cost', 'profit', 'share'],
  staff: ['services', 'quantity', 'revenue', 'commission', 'share'],
  lines: ['amount', 'change'],
  entries: ['given', 'collected'],
  customers: ['given', 'collected', 'outstanding'],
  ledger: ['cash', 'online', 'amount'],
  advances: ['amount', 'recovered', 'outstanding'],
  employees: ['count', 'amount', 'recovered', 'outstanding'],
};

function table(key, title, rows, { totalKeys = TOTAL_KEYS[key] || [], note } = {}) {
  const truncated = rows.length > ROW_CAP;
  const kept = truncated ? rows.slice(0, ROW_CAP) : rows;
  const numeric = kept.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && !['bill_number', 'reference', 'phone'].includes(k) ? Number(v) : v])));
  const totals = {};
  for (const k of totalKeys) if (numeric.some((row) => row[k] !== undefined)) totals[k] = round(numeric.reduce((sum, row) => sum + Number(row[k] || 0), 0));
  if (totals.share !== undefined) totals.share = numeric.length ? 100 : 0;
  return { key, title, rows: numeric, totals, truncated, note };
}

/* ---------------------------------------------------------------- date & filters */

function billScope(basis, filters, { itemAlias } = {}) {
  const params = [];
  const joins = [];
  let date;
  let where;
  if (basis === 'business') {
    joins.push('JOIN business_days bd ON bd.id = COALESCE(b.revenue_business_day_id, b.business_day_id)');
    where = 'bd.business_date BETWEEN ?::date AND ?::date';
    date = 'bd.business_date';
  } else {
    where = `COALESCE(b.transaction_time,b.created_at) >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND COALESCE(b.transaction_time,b.created_at) < ((?::date + 1) AT TIME ZONE 'Asia/Kathmandu')`;
    date = `(COALESCE(b.transaction_time,b.created_at) AT TIME ZONE 'Asia/Kathmandu')::date`;
  }
  params.push(filters.start, filters.end);
  where += ` AND ${PAID_BILL_STATUS_SQL}`;
  if (filters.method) { where += ' AND b.payment_method = ?'; params.push(filters.method); }
  if (filters.staff) {
    if (itemAlias) { where += ` AND ${itemAlias}.staff_id = ?`; }
    else { where += ' AND EXISTS (SELECT 1 FROM salon_bill_items fsi WHERE fsi.bill_id = b.id AND fsi.staff_id = ?)'; }
    params.push(filters.staff);
  }
  return { joins: joins.join(' '), where, params, date };
}

const dateText = (expr) => `to_char(${expr}, 'YYYY-MM-DD')`;

/* ---------------------------------------------------------------- reports */

async function sales(db, f) {
  const s = billScope(f.basis, f);
  let where = s.where;
  const params = [...s.params];
  if (f.category) { where += ' AND EXISTS (SELECT 1 FROM salon_bill_items ci WHERE ci.bill_id = b.id AND ci.item_type = ?)'; params.push(f.category); }
  const alloc = (method) => `(SELECT COALESCE(SUM(a.amount),0) FROM salon_payment_allocations a WHERE a.bill_id=b.id AND a.method='${method}')`;
  const invoices = await db.all(`
    SELECT b.id, b.bill_number, ${dateText(s.date)} AS date, COALESCE(b.transaction_time,b.created_at) AS time,
      COALESCE(NULLIF(b.customer_name,''),'Walk-in Customer') AS customer, b.customer_phone AS phone,
      (SELECT string_agg(DISTINCT COALESCE(si.staff_name_snapshot, u.full_name), ', ') FROM salon_bill_items si LEFT JOIN users u ON u.id = si.staff_id WHERE si.bill_id = b.id) AS staff,
      b.payment_method AS method, b.status, b.subtotal, b.discount_amount AS discount,
      ${alloc('cash')} AS cash, ${alloc('online')} AS online, ${alloc('credit')} AS credit, b.grand_total AS total
    FROM salon_bills b ${s.joins} WHERE ${where}
    ORDER BY COALESCE(b.transaction_time,b.created_at) DESC, b.id DESC LIMIT ${ROW_CAP + 1}`, params);
  const methods = await db.all(`
    SELECT a.method, COUNT(*)::int AS transactions, COALESCE(SUM(a.amount),0) AS amount,
      ROUND(100 * SUM(a.amount) / NULLIF(SUM(SUM(a.amount)) OVER (), 0), 1) AS share
    FROM salon_payment_allocations a JOIN salon_bills b ON b.id = a.bill_id ${s.joins}
    WHERE ${where} GROUP BY a.method ORDER BY amount DESC`, params);
  const categories = await db.all(`
    SELECT CASE WHEN i.item_type='product' THEN 'Product' ELSE 'Service' END AS type,
      COALESCE(NULLIF(CASE WHEN i.item_type='product' THEN p.category ELSE sv.category END,''),'Other') AS category,
      COALESCE(SUM(i.quantity),0)::int AS quantity, COALESCE(SUM(i.subtotal),0) AS amount,
      ROUND(100 * SUM(i.subtotal) / NULLIF(SUM(SUM(i.subtotal)) OVER (), 0), 1) AS share
    FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id ${s.joins}
      LEFT JOIN salon_services sv ON i.item_type <> 'product' AND sv.id = i.item_id
      LEFT JOIN salon_products p ON i.item_type = 'product' AND p.id = i.item_id
    WHERE ${where} GROUP BY 1, 2 ORDER BY amount DESC`, params);
  const daily = await db.all(`
    SELECT ${dateText(s.date)} AS date, COUNT(*)::int AS bills, COALESCE(SUM(b.subtotal),0) AS gross, COALESCE(SUM(b.discount_amount),0) AS discount,
      COALESCE(SUM(${alloc('cash')}),0) AS cash, COALESCE(SUM(${alloc('online')}),0) AS online, COALESCE(SUM(${alloc('credit')}),0) AS credit,
      COALESCE(SUM(b.grand_total),0) AS amount
    FROM salon_bills b ${s.joins} WHERE ${where} GROUP BY 1 ORDER BY 1 DESC`, params);
  const m = await db.get(`
    SELECT COUNT(*)::int AS bills, COALESCE(SUM(b.grand_total),0) AS billed, COALESCE(SUM(b.discount_amount),0) AS discounts,
      COALESCE(SUM(${alloc('cash')}),0) AS cash, COALESCE(SUM(${alloc('online')}),0) AS online, COALESCE(SUM(${alloc('credit')}),0) AS credit
    FROM salon_bills b ${s.joins} WHERE ${where}`, params);
  return {
    metrics: {
      finalized_total: round(m.billed), invoices: Number(m.bills), average_bill: round(Number(m.bills) ? Number(m.billed) / Number(m.bills) : 0),
      discounts: round(m.discounts), cash_received: round(m.cash), online_received: round(m.online), credit_issued: round(m.credit),
    },
    tables: [
      table('invoices', 'Invoices', invoices),
      table('methods', 'Payment method summary', methods),
      table('categories', 'Category summary', categories),
      table('daily', 'Daily sales summary', daily),
    ],
  };
}

async function items(db, f, type) {
  const s = billScope(f.basis, f, { itemAlias: 'i' });
  let where = `i.item_type ${type === 'product' ? "= 'product'" : "<> 'product'"} AND ${s.where}`;
  const params = [...s.params];
  const catExpr = type === 'product' ? "COALESCE(NULLIF(p.category,''),'Other')" : "COALESCE(NULLIF(sv.category,''),'Other')";
  if (f.category) { where += ` AND ${catExpr} = ?`; params.push(f.category); }
  const from = `salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id ${s.joins}
    LEFT JOIN salon_services sv ON i.item_type <> 'product' AND sv.id = i.item_id
    LEFT JOIN salon_products p ON i.item_type = 'product' AND p.id = i.item_id`;
  const itemRows = await db.all(`
    SELECT i.item_id AS id, i.name, ${catExpr} AS category, COALESCE(SUM(i.quantity),0)::int AS quantity,
      COALESCE(SUM(i.subtotal),0) AS revenue, COALESCE(SUM(i.commission_amount),0) AS commission,
      COALESCE(SUM(COALESCE(i.unit_cost_snapshot,0) * i.quantity),0) AS cost,
      COALESCE(SUM(i.subtotal - COALESCE(i.unit_cost_snapshot,0) * i.quantity - COALESCE(i.commission_amount,0)),0) AS profit,
      ROUND(100 * SUM(i.subtotal) / NULLIF(SUM(SUM(i.subtotal)) OVER (), 0), 1) AS share
    FROM ${from} WHERE ${where} GROUP BY i.item_id, i.name, 3 ORDER BY revenue DESC`, params);
  const staff = await db.all(`
    SELECT COALESCE(i.staff_name_snapshot, u.full_name, 'Unassigned') AS staff, COUNT(*)::int AS services, COALESCE(SUM(i.quantity),0)::int AS quantity,
      COALESCE(SUM(i.subtotal),0) AS revenue, COALESCE(SUM(i.commission_amount),0) AS commission,
      ROUND(100 * SUM(i.subtotal) / NULLIF(SUM(SUM(i.subtotal)) OVER (), 0), 1) AS share
    FROM ${from} LEFT JOIN users u ON u.id = i.staff_id WHERE ${where} GROUP BY 1 ORDER BY revenue DESC`, params);
  const categories = await db.all(`
    SELECT ${catExpr} AS category, COALESCE(SUM(i.quantity),0)::int AS quantity, COALESCE(SUM(i.subtotal),0) AS amount,
      ROUND(100 * SUM(i.subtotal) / NULLIF(SUM(SUM(i.subtotal)) OVER (), 0), 1) AS share
    FROM ${from} WHERE ${where} GROUP BY 1 ORDER BY amount DESC`, params);
  const daily = await db.all(`
    SELECT ${dateText(s.date)} AS date, COALESCE(SUM(i.quantity),0)::int AS ${type === 'product' ? 'units' : 'services'},
      COALESCE(SUM(i.subtotal),0) AS revenue, COALESCE(SUM(i.commission_amount),0) AS commission,
      COALESCE(SUM(COALESCE(i.unit_cost_snapshot,0) * i.quantity),0) AS cost
    FROM ${from} WHERE ${where} GROUP BY 1 ORDER BY 1 DESC`, params);
  const m = await db.get(`
    SELECT COALESCE(SUM(i.quantity),0)::int AS quantity, COALESCE(SUM(i.subtotal),0) AS revenue, COALESCE(SUM(i.commission_amount),0) AS commission,
      COALESCE(SUM(COALESCE(i.unit_cost_snapshot,0) * i.quantity),0) AS cost
    FROM ${from} WHERE ${where}`, params);
  const label = type === 'product' ? 'Products' : 'Services';
  return {
    metrics: {
      revenue: round(m.revenue), quantity: Number(m.quantity), commission: round(m.commission), cost: round(m.cost),
      gross_profit: round(Number(m.revenue) - Number(m.cost) - Number(m.commission)),
    },
    tables: [
      table('items', label, itemRows),
      table('staff', type === 'product' ? 'Sold by staff' : 'Staff performance', staff),
      table('categories', 'Category summary', categories),
      table('daily', `Daily ${label.toLowerCase()} summary`, daily),
    ],
  };
}

async function payments(db, f) {
  const s = billScope(f.basis, { ...f, method: '' });
  let where = s.where;
  const params = [...s.params];
  if (f.method) { where += ' AND a.method = ?'; params.push(f.method); }
  if (f.category) { where += " AND COALESCE(a.provider,'') = ?"; params.push(f.category === 'none' ? '' : f.category); }
  const from = `salon_payment_allocations a JOIN salon_bills b ON b.id = a.bill_id ${s.joins}`;
  const lines = await db.all(`
    SELECT a.id, ${dateText(s.date)} AS date, a.created_at AS time, b.id AS bill_id, b.bill_number,
      COALESCE(NULLIF(b.customer_name,''),'Walk-in Customer') AS customer, a.method, COALESCE(a.provider,'') AS provider,
      a.reference_number AS reference, a.amount, COALESCE(a.change_amount,0) AS change
    FROM ${from} WHERE ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ${ROW_CAP + 1}`, params);
  const methods = await db.all(`
    SELECT a.method, COALESCE(a.provider,'') AS provider, COUNT(*)::int AS transactions, COALESCE(SUM(a.amount),0) AS amount,
      ROUND(100 * SUM(a.amount) / NULLIF(SUM(SUM(a.amount)) OVER (), 0), 1) AS share
    FROM ${from} WHERE ${where} GROUP BY 1, 2 ORDER BY amount DESC`, params);
  const daily = await db.all(`
    SELECT ${dateText(s.date)} AS date,
      COALESCE(SUM(a.amount) FILTER (WHERE a.method='cash'),0) AS cash, COALESCE(SUM(a.amount) FILTER (WHERE a.method='online'),0) AS online,
      COALESCE(SUM(a.amount) FILTER (WHERE a.method='credit'),0) AS credit, COALESCE(SUM(a.amount),0) AS amount
    FROM ${from} WHERE ${where} GROUP BY 1 ORDER BY 1 DESC`, params);
  const m = await db.get(`
    SELECT COUNT(*)::int AS n, COALESCE(SUM(a.amount),0) AS amount,
      COALESCE(SUM(a.amount) FILTER (WHERE a.method='cash'),0) AS cash, COALESCE(SUM(a.amount) FILTER (WHERE a.method='online'),0) AS online,
      COALESCE(SUM(a.amount) FILTER (WHERE a.method='credit'),0) AS credit
    FROM ${from} WHERE ${where}`, params);
  return {
    metrics: { settled: round(m.amount), cash_received: round(m.cash), online_received: round(m.online), credit_issued: round(m.credit), transactions: Number(m.n) },
    tables: [
      table('methods', 'Method & provider summary', methods),
      table('daily', 'Daily settlement', daily),
      table('lines', 'Payment lines', lines),
    ],
  };
}

async function credit(db, f) {
  const params = [f.start, f.end];
  let joins = '';
  let where;
  let date;
  if (f.basis === 'business') {
    joins = 'JOIN business_days bd ON bd.id = l.business_day_id';
    where = 'bd.business_date BETWEEN ?::date AND ?::date';
    date = 'bd.business_date';
  } else {
    where = `l.created_at >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND l.created_at < ((?::date + 1) AT TIME ZONE 'Asia/Kathmandu')`;
    date = `(l.created_at AT TIME ZONE 'Asia/Kathmandu')::date`;
  }
  if (f.category) { where += ' AND l.entry_type = ?'; params.push(f.category); }
  const from = `customer_credit_ledger l JOIN customers c ON c.id = l.customer_id LEFT JOIN salon_bills sb ON sb.id = l.bill_id ${joins}`;
  const entries = await db.all(`
    SELECT l.id, ${dateText(date)} AS date, l.created_at AS time, c.id AS customer_id, c.name AS customer, c.phone, l.entry_type AS entry,
      l.bill_id, sb.bill_number, l.debit AS given, l.credit AS collected, l.note
    FROM ${from} WHERE ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ${ROW_CAP + 1}`, params);
  const customers = await db.all(`
    SELECT c.id AS customer_id, c.name AS customer, c.phone, COALESCE(SUM(l.debit),0) AS given, COALESCE(SUM(l.credit),0) AS collected,
      (SELECT COALESCE(SUM(x.debit - x.credit),0) FROM customer_credit_ledger x WHERE x.customer_id = c.id) AS outstanding
    FROM ${from} WHERE ${where} GROUP BY c.id, c.name, c.phone ORDER BY outstanding DESC, given DESC`, params);
  const m = await db.get(`SELECT COALESCE(SUM(l.debit),0) AS given, COALESCE(SUM(l.credit),0) AS collected FROM ${from} WHERE ${where}`, params);
  const balance = await db.get('SELECT COALESCE(SUM(debit - credit),0) AS balance FROM customer_credit_ledger');
  return {
    metrics: { credit_given: round(m.given), credit_collected: round(m.collected), outstanding: round(balance.balance) },
    tables: [table('entries', 'Credit ledger entries', entries), table('customers', 'Customer balances', customers)],
  };
}

async function expenses(db, f) {
  let where = `${OPERATING_EXPENSE_SQL} AND e.expense_date BETWEEN ?::date AND ?::date`;
  const params = [f.start, f.end];
  if (f.method) { where += ' AND LOWER(e.payment_method) = LOWER(?)'; params.push(f.method); }
  if (f.category) { where += ' AND e.category = ?'; params.push(f.category); }
  const ledger = await db.all(`
    SELECT e.id, ${dateText('e.expense_date')} AS date, e.title, e.category, e.paid_to, LOWER(e.payment_method) AS method,
      COALESCE(e.cash_amount,0) AS cash, COALESCE(e.online_amount,0) AS online, e.amount, e.reference_number AS reference, e.notes
    FROM expenses e WHERE ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT ${ROW_CAP + 1}`, params);
  const categories = await db.all(`
    SELECT e.category, COUNT(*)::int AS count, COALESCE(SUM(e.amount),0) AS amount,
      ROUND(100 * SUM(e.amount) / NULLIF(SUM(SUM(e.amount)) OVER (), 0), 1) AS share
    FROM expenses e WHERE ${where} GROUP BY 1 ORDER BY amount DESC`, params);
  const methods = await db.all(`
    SELECT LOWER(e.payment_method) AS method, COUNT(*)::int AS count, COALESCE(SUM(e.amount),0) AS amount,
      ROUND(100 * SUM(e.amount) / NULLIF(SUM(SUM(e.amount)) OVER (), 0), 1) AS share
    FROM expenses e WHERE ${where} GROUP BY 1 ORDER BY amount DESC`, params);
  const daily = await db.all(`SELECT ${dateText('e.expense_date')} AS date, COUNT(*)::int AS count, COALESCE(SUM(e.amount),0) AS amount FROM expenses e WHERE ${where} GROUP BY 1 ORDER BY 1 DESC`, params);
  const m = await db.get(`SELECT COUNT(*)::int AS n, COALESCE(SUM(e.amount),0) AS amount, COALESCE(SUM(e.cash_amount),0) AS cash, COALESCE(SUM(e.online_amount),0) AS online FROM expenses e WHERE ${where}`, params);
  return {
    metrics: { expenses: round(m.amount), expense_count: Number(m.n), cash_paid: round(m.cash), online_paid: round(m.online) },
    tables: [
      table('ledger', 'Expense ledger', ledger),
      table('categories', 'Category summary', categories),
      table('methods', 'Payment method summary', methods),
      table('daily', 'Daily expenses', daily),
    ],
  };
}

async function advances(db, f) {
  let where = "a.deleted_at IS NULL AND a.status <> 'CANCELLED' AND a.payment_date BETWEEN ?::date AND ?::date";
  const params = [f.start, f.end];
  if (f.staff) { where += ' AND a.staff_id = ?'; params.push(f.staff); }
  if (f.method) { where += ' AND LOWER(a.payment_method) = LOWER(?)'; params.push(f.method); }
  const rows = await db.all(`
    SELECT a.id, ${dateText('a.payment_date')} AS date, u.full_name AS employee, LOWER(a.payment_method) AS method, a.status,
      a.amount, a.applied_amount AS recovered, (a.amount - a.applied_amount) AS outstanding, a.reference_number AS reference, a.note
    FROM salary_advances a JOIN users u ON u.id = a.staff_id WHERE ${where} ORDER BY a.payment_date DESC, a.id DESC LIMIT ${ROW_CAP + 1}`, params);
  const employees = await db.all(`
    SELECT u.full_name AS employee, COUNT(*)::int AS count, COALESCE(SUM(a.amount),0) AS amount, COALESCE(SUM(a.applied_amount),0) AS recovered,
      COALESCE(SUM(a.amount - a.applied_amount),0) AS outstanding
    FROM salary_advances a JOIN users u ON u.id = a.staff_id WHERE ${where} GROUP BY u.id, u.full_name ORDER BY amount DESC`, params);
  const m = await db.get(`SELECT COALESCE(SUM(a.amount),0) AS issued, COALESCE(SUM(a.applied_amount),0) AS recovered, COALESCE(SUM(a.amount - a.applied_amount),0) AS outstanding FROM salary_advances a WHERE ${where}`, params);
  return {
    metrics: { issued: round(m.issued), recovered: round(m.recovered), outstanding: round(m.outstanding) },
    tables: [table('advances', 'Salary advances', rows), table('employees', 'By employee', employees)],
  };
}

export const WORKSPACE_REPORTS = ['sales', 'services', 'products', 'payments', 'credit', 'expenses', 'advances'];

export async function buildWorkspaceReport(db, report, filters) {
  switch (report) {
    case 'sales': return sales(db, filters);
    case 'services': return items(db, filters, 'service');
    case 'products': return items(db, filters, 'product');
    case 'payments': return payments(db, filters);
    case 'credit': return credit(db, filters);
    case 'expenses': return expenses(db, filters);
    case 'advances': return advances(db, filters);
    default: throw Object.assign(new Error('Unknown report'), { status: 404 });
  }
}

/** Options for the filter dropdowns — only values that exist in the data. */
export async function workspaceFilterOptions(db, report) {
  const staff = await db.all("SELECT id, full_name AS name FROM users WHERE role IN ('barber','stylist','beautician','cashier','admin') AND COALESCE(is_active, true) ORDER BY full_name");
  const options = { staff: [], methods: [], categories: [], categoryLabel: '', basis: !['expenses', 'advances'].includes(report) };
  if (['sales', 'services', 'products', 'payments', 'advances'].includes(report)) options.staff = staff;
  if (['sales', 'payments'].includes(report)) options.methods = report === 'sales' ? ['cash', 'online', 'credit', 'split'] : ['cash', 'online', 'credit'];
  if (report === 'expenses') options.methods = (await db.all("SELECT DISTINCT LOWER(payment_method) AS m FROM expenses WHERE payment_method IS NOT NULL ORDER BY 1")).map((r) => r.m);
  if (report === 'advances') options.methods = (await db.all("SELECT DISTINCT LOWER(payment_method) AS m FROM salary_advances WHERE payment_method IS NOT NULL ORDER BY 1")).map((r) => r.m);
  if (report === 'sales') { options.categoryLabel = 'All item types'; options.categories = [{ value: 'service', label: 'Bills with services' }, { value: 'product', label: 'Bills with products' }]; }
  if (report === 'services') { options.categoryLabel = 'All service categories'; options.categories = (await db.all("SELECT DISTINCT COALESCE(NULLIF(category,''),'Other') AS c FROM salon_services ORDER BY 1")).map((r) => ({ value: r.c, label: r.c })); }
  if (report === 'products') { options.categoryLabel = 'All product categories'; options.categories = (await db.all("SELECT DISTINCT COALESCE(NULLIF(category,''),'Other') AS c FROM salon_products ORDER BY 1")).map((r) => ({ value: r.c, label: r.c })); }
  if (report === 'payments') { options.categoryLabel = 'All providers'; options.categories = [{ value: 'ESEWA_PHONEPAY', label: 'eSewa / PhonePay' }, { value: 'BANK', label: 'Bank QR' }, { value: 'none', label: 'No provider (cash / credit)' }]; }
  if (report === 'credit') { options.categoryLabel = 'All entry types'; options.categories = (await db.all('SELECT DISTINCT entry_type AS c FROM customer_credit_ledger ORDER BY 1')).map((r) => ({ value: r.c, label: r.c })); }
  if (report === 'expenses') { options.categoryLabel = 'All categories'; options.categories = (await db.all(`SELECT DISTINCT e.category AS c FROM expenses e WHERE ${OPERATING_EXPENSE_SQL} ORDER BY 1`)).map((r) => ({ value: r.c, label: r.c })); }
  return options;
}
