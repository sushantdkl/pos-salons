/**
 * CUSTOMER PROFILE + CUSTOMER LEDGER — computed here (server-side maths only).
 *
 * Source of truth is customer_credit_ledger (debit = credit given on a bill, credit = money
 * collected / reversal / write-off). Balance = SUM(debit − credit), exactly what the credit
 * collection API checks against.
 *
 * Invoice status: each credit bill is an invoice for its credit_sale amount. A reversal (bill
 * voided) or write-off tied to a bill settles that bill first; collections are not tied to a bill,
 * so they settle the oldest open credit bill first. What stays open is still owed.
 */

import { customerBalances, listTransactions } from '@/lib/loyalty/service';
import { listReviews } from '@/lib/reviews/service';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const EPS = 0.001;

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function invoiceStatus(total, open) {
  if (open <= EPS) return 'PAID';
  if (open >= total - EPS) return 'CREDIT';
  return 'PARTIAL';
}

const LEDGER_TITLES = {
  credit_sale: 'Credit given on bill',
  credit_collection: 'Credit payment received',
  reversal: 'Credit reversed (bill voided)',
  writeoff: 'Credit written off',
};

/** Every customer who has ever had credit, with what they owe now (Customer Ledger overview). */
export async function listCustomerBalances(db, { q = '' } = {}) {
  const search = String(q || '').trim();
  const params = [];
  let where = '';
  if (search) { where = 'WHERE (c.name ILIKE ? OR c.phone ILIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const rows = await db.all(`
    SELECT c.id, c.name, c.phone,
           COALESCE(SUM(l.debit) FILTER (WHERE l.entry_type = 'credit_sale'), 0) AS credit_given,
           COALESCE(SUM(l.credit) FILTER (WHERE l.entry_type = 'credit_collection'), 0) AS collected,
           COALESCE(SUM(l.credit) FILTER (WHERE l.entry_type IN ('reversal', 'writeoff')), 0) AS reversed,
           COALESCE(SUM(l.debit - l.credit), 0) AS balance,
           MAX(l.created_at) AS last_activity
    FROM customers c
    JOIN customer_credit_ledger l ON l.customer_id = c.id
    ${where}
    GROUP BY c.id, c.name, c.phone
    ORDER BY balance DESC, last_activity DESC
    LIMIT 1000
  `, params);
  const customers = rows.map((row) => ({
    id: row.id, name: row.name, phone: row.phone,
    creditGiven: round2(row.credit_given), collected: round2(row.collected), reversed: round2(row.reversed),
    balance: round2(row.balance), lastActivity: row.last_activity,
  }));
  return {
    customers,
    totals: {
      outstanding: round2(customers.reduce((sum, row) => sum + Math.max(0, row.balance), 0)),
      withBalance: customers.filter((row) => row.balance > EPS).length,
      creditGiven: round2(customers.reduce((sum, row) => sum + row.creditGiven, 0)),
      collected: round2(customers.reduce((sum, row) => sum + row.collected, 0)),
    },
  };
}

export async function getCustomerProfile(db, customerId, { includePhone = true } = {}) {
  const customer = await db.get(`
    SELECT c.*, COALESCE(u.full_name, u.username) AS preferred_stylist_name
    FROM customers c LEFT JOIN users u ON u.id = c.preferred_stylist_id
    WHERE c.id = ?
  `, [customerId]);
  if (!customer) throw httpError('Customer not found', 404);

  const [billRows, itemRows, ledgerRows, collectionRows, appointmentRows, voidRows] = await Promise.all([
    db.all(`
      SELECT b.id, b.bill_number, b.grand_total, b.subtotal, b.discount_amount, b.tax, b.payment_method, b.payment_status,
             b.credit_amount, b.status, b.created_at, b.transaction_time, COALESCE(u.full_name, u.username) AS cashier_name
      FROM salon_bills b LEFT JOIN users u ON u.id = b.cashier_id
      WHERE b.customer_id = ?
      ORDER BY b.created_at, b.id
    `, [customerId]),
    db.all(`
      SELECT i.bill_id, i.item_type, i.item_id, i.name, i.quantity, i.subtotal, i.staff_name_snapshot
      FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id
      WHERE b.customer_id = ?
      ORDER BY i.bill_id, i.id
    `, [customerId]),
    db.all(`
      SELECT l.id, l.bill_id, l.entry_type, l.debit, l.credit, l.due_date::text AS due_date, l.note, l.created_at,
             b.bill_number, COALESCE(u.full_name, u.username) AS recorded_by
      FROM customer_credit_ledger l
      LEFT JOIN salon_bills b ON b.id = l.bill_id
      LEFT JOIN users u ON u.id = l.created_by
      WHERE l.customer_id = ?
      ORDER BY l.created_at, l.id
    `, [customerId]),
    db.all(`
      SELECT cc.id, cc.ledger_id, cc.amount, cc.payment_method, cc.provider, cc.reference_number, cc.created_at,
             COALESCE(u.full_name, u.username) AS received_by
      FROM customer_credit_collections cc LEFT JOIN users u ON u.id = cc.created_by
      WHERE cc.customer_id = ?
      ORDER BY cc.created_at, cc.id
    `, [customerId]),
    db.all(`
      SELECT a.id, a.appointment_number, a.appointment_date::text AS appointment_date, a.start_time::text AS start_time,
             a.status, a.source, COALESCE(u.full_name, u.username) AS staff_name,
             (SELECT string_agg(aps.service_name, ', ' ORDER BY aps.sort_order, aps.id) FROM appointment_services aps WHERE aps.appointment_id = a.id) AS services
      FROM appointments a LEFT JOIN users u ON u.id = a.staff_id
      WHERE a.customer_id = ?
      ORDER BY a.appointment_date DESC, a.start_time DESC
      LIMIT 200
    `, [customerId]),
    db.all(`
      SELECT fc.source_id AS bill_id, fc.reason, fc.created_at
      FROM financial_corrections fc JOIN salon_bills b ON b.id = fc.source_id
      WHERE fc.source_type = 'salon_bill' AND fc.correction_type = 'void' AND b.customer_id = ?
    `, [customerId]),
  ]);

  const itemsByBill = new Map();
  for (const row of itemRows) {
    if (!itemsByBill.has(row.bill_id)) itemsByBill.set(row.bill_id, []);
    itemsByBill.get(row.bill_id).push({
      type: row.item_type, itemId: row.item_id, name: row.name, quantity: Number(row.quantity), subtotal: round2(row.subtotal), staff: row.staff_name_snapshot,
    });
  }
  const voidByBill = new Map(voidRows.map((row) => [row.bill_id, row]));

  /* ---- ledger with running balance */
  let running = 0;
  const ledger = ledgerRows.map((row) => {
    const debit = round2(row.debit);
    const credit = round2(row.credit);
    running = round2(running + debit - credit);
    return {
      id: row.id, billId: row.bill_id, billNumber: row.bill_number, type: row.entry_type, title: LEDGER_TITLES[row.entry_type] || row.entry_type,
      debit, credit, balance: running, dueDate: row.due_date, note: row.note, createdAt: row.created_at, recordedBy: row.recorded_by,
    };
  });
  const balance = running;

  /* ---- allocation: credit bills are the invoices */
  const invoices = [];
  const invoiceByBill = new Map();
  for (const row of ledger) {
    if (row.type !== 'credit_sale' || !row.billId) continue;
    let invoice = invoiceByBill.get(row.billId);
    if (!invoice) {
      invoice = { billId: row.billId, label: row.billNumber || `Bill #${row.billId}`, total: 0, open: 0, dueDate: row.dueDate, createdAt: row.createdAt };
      invoiceByBill.set(row.billId, invoice);
      invoices.push(invoice);
    }
    invoice.total = round2(invoice.total + row.debit);
    invoice.open = round2(invoice.open + row.debit);
  }
  const allocationsByLedger = new Map();
  const apply = (ledgerId, invoice, amount) => {
    const applied = round2(Math.min(amount, invoice.open));
    if (applied <= EPS) return 0;
    invoice.open = round2(invoice.open - applied);
    if (!allocationsByLedger.has(ledgerId)) allocationsByLedger.set(ledgerId, []);
    allocationsByLedger.get(ledgerId).push({ billId: invoice.billId, recordId: invoice.billId, label: invoice.label, amount: applied });
    return applied;
  };
  const reductions = ledger.filter((row) => row.credit > 0);
  const leftover = new Map();
  for (const row of reductions) {
    let remaining = row.credit;
    const own = row.billId ? invoiceByBill.get(row.billId) : null;
    if (own) remaining = round2(remaining - apply(row.id, own, remaining));
    leftover.set(row.id, remaining);
  }
  for (const row of reductions) {
    let remaining = leftover.get(row.id);
    for (const invoice of invoices) {
      if (remaining <= EPS) break;
      remaining = round2(remaining - apply(row.id, invoice, remaining));
    }
  }

  /* ---- bills (visits) */
  const bills = billRows.map((row) => {
    const invoice = invoiceByBill.get(row.id);
    const items = itemsByBill.get(row.id) || [];
    const voided = row.status === 'cancelled';
    return {
      id: row.id, number: row.bill_number, total: round2(row.grand_total), discount: round2(row.discount_amount), tax: round2(row.tax),
      paymentMethod: row.payment_method, creditAmount: round2(row.credit_amount), status: row.status,
      creditStatus: invoice ? (voided ? 'VOID' : invoiceStatus(invoice.total, invoice.open)) : (voided ? 'VOID' : 'PAID'),
      creditOpen: invoice ? invoice.open : 0,
      createdAt: row.created_at, cashier: row.cashier_name,
      services: items.filter((item) => item.type === 'service').map((item) => item.name),
      products: items.filter((item) => item.type === 'product').map((item) => item.name),
      staff: [...new Set(items.map((item) => item.staff).filter(Boolean))],
      items,
      voidReason: voidByBill.get(row.id)?.reason || null, voidedAt: voidByBill.get(row.id)?.created_at || null,
    };
  });
  const liveBills = bills.filter((bill) => bill.status !== 'cancelled');

  /* ---- services & products used */
  const usedMap = new Map();
  for (const bill of liveBills) {
    for (const item of bill.items) {
      const key = `${item.type}-${item.itemId}-${item.name}`;
      const current = usedMap.get(key) || { type: item.type, name: item.name, times: 0, quantity: 0, spent: 0, lastDate: null, lastStaff: null };
      current.times += 1;
      current.quantity += item.quantity;
      current.spent = round2(current.spent + item.subtotal);
      if (!current.lastDate || new Date(bill.createdAt) >= new Date(current.lastDate)) {
        current.lastDate = bill.createdAt;
        current.lastStaff = item.staff || current.lastStaff;
      }
      usedMap.set(key, current);
    }
  }
  const services = [...usedMap.values()].sort((a, b) => b.spent - a.spent);

  /* ---- credit payments (collections) */
  const ledgerById = new Map(ledger.map((row) => [row.id, row]));
  const payments = collectionRows.map((row) => ({
    id: row.id, ledgerId: row.ledger_id, amount: round2(row.amount), method: row.payment_method, provider: row.provider,
    reference: row.reference_number, createdAt: row.created_at, receivedBy: row.received_by,
    balanceAfter: ledgerById.get(row.ledger_id)?.balance ?? null,
    allocations: allocationsByLedger.get(row.ledger_id) || [],
  }));

  /* ---- timeline (newest first) */
  const timeline = [{ id: 'profile', at: customer.created_at, kind: 'profile', tone: 'neutral', title: 'Customer profile created', description: customer.name }];
  const creditBalanceAtBill = new Map();
  for (const row of ledger) if (row.type === 'credit_sale' && row.billId) creditBalanceAtBill.set(row.billId, row.balance);
  for (const bill of bills) {
    const onCredit = bill.creditAmount > 0;
    timeline.push({
      id: `bill-${bill.id}`, at: bill.createdAt, kind: 'bill', tone: onCredit ? 'charge' : 'neutral',
      title: `${onCredit ? 'Credit bill' : 'Bill'} ${bill.number} issued`,
      description: [bill.services.join(', '), bill.products.length ? `Products: ${bill.products.join(', ')}` : ''].filter(Boolean).join(' · ') || 'Salon bill',
      amount: bill.total, amountLabel: 'Bill total',
      balance: onCredit && bill.status !== 'cancelled' ? creditBalanceAtBill.get(bill.id) ?? null : null,
      status: onCredit ? bill.creditStatus : (bill.status === 'cancelled' ? 'VOID' : null),
      meta: [
        onCredit ? `On credit ${bill.creditAmount.toFixed(2)}` : `Paid ${String(bill.paymentMethod || '').toLowerCase()}`,
        bill.staff.length ? `Staff ${bill.staff.join(', ')}` : null,
        bill.cashier ? `Billed by ${bill.cashier}` : null,
      ].filter(Boolean),
      recordId: bill.id,
    });
  }
  for (const row of ledger) {
    if (row.type === 'credit_sale') continue; // the bill card is the same event
    const collection = payments.find((payment) => payment.ledgerId === row.id);
    timeline.push({
      id: `ledger-${row.id}`, at: row.createdAt, kind: row.type === 'credit_collection' ? 'payment' : 'adjustment',
      tone: row.type === 'credit_collection' ? 'payment' : 'neutral',
      title: row.title,
      description: collection
        ? [collection.method === 'cash' ? 'Cash' : `Online${collection.provider ? ` · ${collection.provider}` : ''}`, collection.reference, row.note && row.note !== 'Credit collection' ? row.note : null].filter(Boolean).join(' · ')
        : (row.note || (row.billNumber ? `Bill ${row.billNumber}` : '')),
      amount: row.credit || row.debit, amountLabel: row.credit ? 'Reduced credit due' : 'Added to credit due',
      balance: row.balance,
      meta: [row.recordedBy ? `By ${row.recordedBy}` : null].filter(Boolean),
      allocations: allocationsByLedger.get(row.id) || [],
      recordId: row.billId || null,
    });
  }
  for (const bill of bills) {
    if (bill.status !== 'cancelled' || !bill.voidedAt) continue;
    timeline.push({
      id: `bill-void-${bill.id}`, at: bill.voidedAt, kind: 'adjustment', tone: 'neutral',
      title: `Bill ${bill.number} voided`, description: bill.voidReason || 'Voided', amount: bill.total, amountLabel: 'Bill total', recordId: bill.id,
    });
  }
  timeline.sort((a, b) => (new Date(b.at || 0) - new Date(a.at || 0)) || String(b.id).localeCompare(String(a.id)));

  const openInvoices = invoices.filter((invoice) => invoice.open > EPS).map((invoice) => ({
    billId: invoice.billId, label: invoice.label, total: invoice.total, open: invoice.open, dueDate: invoice.dueDate,
  }));
  const totalSpent = round2(liveBills.reduce((sum, bill) => sum + bill.total, 0));

  return {
    customer: {
      id: customer.id, name: customer.name, phone: includePhone ? customer.phone : null, email: customer.email, address: customer.address,
      gender: customer.gender, category: customer.customer_category, notes: customer.notes, favoriteServices: customer.favorite_services,
      preferredStaff: customer.preferred_stylist_name, creditLimit: round2(customer.credit_limit), createdAt: customer.created_at,
    },
    summary: {
      totalSpent,
      visits: liveBills.length,
      averageBill: liveBills.length ? round2(totalSpent / liveBills.length) : 0,
      lastVisit: liveBills.length ? liveBills[liveBills.length - 1].createdAt : null,
      creditOutstanding: balance,
      creditGiven: round2(ledger.filter((row) => row.type === 'credit_sale').reduce((sum, row) => sum + row.debit, 0)),
      collected: round2(payments.reduce((sum, payment) => sum + payment.amount, 0)),
      openBills: openInvoices.length,
      appointments: appointmentRows.length,
    },
    openInvoices,
    bills: [...bills].reverse(),
    services,
    ledger,
    payments: [...payments].reverse(),
    appointments: appointmentRows.map((row) => ({
      id: row.id, number: row.appointment_number, date: row.appointment_date, time: String(row.start_time || '').slice(0, 5),
      status: row.status, source: row.source, staff: row.staff_name, services: row.services || '',
    })),
    timeline,
    loyalty: {
      programs: (await customerBalances(db, customerId)).filter((row) => row.isActive || row.enrolled),
      transactions: await listTransactions(db, { customerId, limit: 100 }),
    },
    reviews: await (async () => {
      const items = await listReviews(db, { customerId, limit: 100 });
      const rated = items.filter((row) => row.rating && row.status !== 'ARCHIVED');
      return {
        items,
        total: items.length,
        average: rated.length ? Math.round((rated.reduce((sum, row) => sum + row.rating, 0) / rated.length) * 10) / 10 : null,
        latest: items[0] || null,
      };
    })(),
  };
}
