/**
 * BUSINESS DAY REPORT — everything about one business day, for the day details popup
 * (the salon's version of a closing report).
 *
 * Every money figure comes from getFinancialSummary scoped to the business day, and every
 * session's drawer figures are its PERSISTED close snapshot (expected / counted / difference /
 * note breakdown) — the same numbers the history table shows, so the two can never disagree.
 * Salary figures are admin-only; a cashier sees them folded into "cash paid out".
 */

import { computeExpectedCash } from '@/lib/business-day/service';
import { getFinancialSummary, numeric, PAID_BILL_STATUS_SQL } from '@/lib/reports/finance-summary';
import { listCategories } from '@/lib/expenses/categories';
import { mapMovement } from '@/lib/cash/movements';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function dateIso(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value || '').slice(0, 10);
}

const REVENUE_DAY = `(CASE WHEN b.backdated_by IS NOT NULL THEN b.revenue_business_day_id ELSE COALESCE(b.revenue_business_day_id, b.business_day_id) END)`;

export async function getBusinessDayReport(db, dayId, { forAdmin = false } = {}) {
  const day = await db.get(`
    SELECT bd.*, COALESCE(ob.full_name, ob.username, '') AS opened_by_name, COALESCE(cb.full_name, cb.username, '') AS closed_by_name
    FROM business_days bd
    LEFT JOIN users ob ON ob.id = bd.opened_by
    LEFT JOIN users cb ON cb.id = bd.closed_by
    WHERE bd.id = ?
  `, [Number(dayId)]);
  if (!day) return null;

  const fin = await getFinancialSummary(db, 'today', { businessDayId: day.id, includeSalary: true });

  const sessionRows = await db.all(`
    SELECT ss.*, COALESCE(so.full_name, so.username, '') AS opened_by_name, COALESCE(sc.full_name, sc.username, '') AS closed_by_name
    FROM store_sessions ss
    LEFT JOIN users so ON so.id = ss.opened_by
    LEFT JOIN users sc ON sc.id = ss.closed_by
    WHERE ss.business_day_id = ?
    ORDER BY ss.session_number ASC, ss.id ASC
  `, [day.id]);
  const sessions = await Promise.all(sessionRows.map(async (row) => {
    const calc = await computeExpectedCash(db, row);
    const open = row.status === 'OPEN';
    return {
      id: Number(row.id),
      sessionNumber: Number(row.session_number || 1),
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openedBy: row.opened_by_name,
      closedBy: row.closed_by_name,
      startingCash: numeric(row.starting_cash),
      // Closed: the persisted snapshot. Open: live.
      expectedCash: open ? calc.expectedCash : numeric(row.expected_cash),
      countedCash: open ? null : numeric(row.counted_cash),
      difference: open ? null : numeric(row.cash_difference),
      denominations: row.cash_denominations || null,
      openingNote: row.opening_note || null,
      closingNote: row.closing_note || null,
      forceClosed: Boolean(row.force_closed),
      forceCloseReason: row.force_close_reason || null,
      calculation: {
        startingCash: calc.startingCash,
        cashSales: calc.cashCollections,
        creditCollectionsCash: calc.creditCollectionsCash,
        ownerCashIn: calc.ownerCashIn,
        exchangeCashIn: calc.exchangeCashIn,
        cashRefunds: calc.cashRefunds,
        ...(forAdmin ? { operatingExpensesCash: calc.operatingExpensesCash, salaryCash: calc.salaryCash } : {}),
        cashExpenses: calc.cashExpenses,
        cashSavingsOut: calc.cashSavingsOut,
        ownerCashOut: calc.ownerCashOut,
        exchangeCashOut: calc.exchangeCashOut,
        expectedCash: calc.expectedCash,
      },
    };
  }));

  const bills = await db.all(`
    SELECT b.id, b.bill_number, b.customer_name, b.grand_total, b.payment_method, b.status, b.token_id, b.appointment_id,
           COALESCE(b.transaction_time, b.created_at) AS transaction_time,
           COALESCE(u.full_name, u.username, '') AS cashier_name,
           (SELECT STRING_AGG(DISTINCT COALESCE(NULLIF(i.staff_name_snapshot, ''), su.full_name), ', ')
              FROM salon_bill_items i LEFT JOIN users su ON su.id = i.staff_id WHERE i.bill_id = b.id) AS staff_names,
           (SELECT STRING_AGG(i.name, ', ' ORDER BY i.id) FROM salon_bill_items i WHERE i.bill_id = b.id) AS items
    FROM salon_bills b
    LEFT JOIN users u ON u.id = b.cashier_id
    WHERE ${REVENUE_DAY} = ? AND ${PAID_BILL_STATUS_SQL}
    ORDER BY COALESCE(b.transaction_time, b.created_at) DESC, b.id DESC
  `, [day.id]);

  const visitRow = await db.get(`
    SELECT
      COUNT(CASE WHEN b.appointment_id IS NOT NULL THEN 1 END)::int AS appointment_bills,
      COALESCE(SUM(CASE WHEN b.appointment_id IS NOT NULL THEN b.grand_total ELSE 0 END), 0) AS appointment_sales,
      COUNT(CASE WHEN b.appointment_id IS NULL AND b.token_id IS NOT NULL THEN 1 END)::int AS token_bills,
      COALESCE(SUM(CASE WHEN b.appointment_id IS NULL AND b.token_id IS NOT NULL THEN b.grand_total ELSE 0 END), 0) AS token_sales,
      COUNT(CASE WHEN b.appointment_id IS NULL AND b.token_id IS NULL THEN 1 END)::int AS direct_bills,
      COALESCE(SUM(CASE WHEN b.appointment_id IS NULL AND b.token_id IS NULL THEN b.grand_total ELSE 0 END), 0) AS direct_sales
    FROM salon_bills b WHERE ${REVENUE_DAY} = ? AND ${PAID_BILL_STATUS_SQL}
  `, [day.id]);

  const itemRows = await db.all(`
    SELECT i.item_type, i.name, SUM(i.quantity)::int AS quantity, COALESCE(SUM(i.subtotal), 0) AS amount
    FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id
    WHERE ${REVENUE_DAY} = ? AND LOWER(COALESCE(b.status, '')) IN ('paid', 'completed')
    GROUP BY i.item_type, i.name ORDER BY quantity DESC, amount DESC
  `, [day.id]);

  const staffRows = await db.all(`
    SELECT COALESCE(NULLIF(i.staff_name_snapshot, ''), u.full_name, 'Unassigned') AS staff,
           SUM(CASE WHEN i.item_type = 'service' THEN i.quantity ELSE 0 END)::int AS services,
           COUNT(DISTINCT b.id)::int AS customers,
           COALESCE(SUM(i.subtotal), 0) AS revenue,
           COALESCE(SUM(i.commission_amount), 0) AS commission
    FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id
    LEFT JOIN users u ON u.id = i.staff_id
    WHERE ${REVENUE_DAY} = ? AND LOWER(COALESCE(b.status, '')) IN ('paid', 'completed') AND i.staff_id IS NOT NULL
    GROUP BY 1 ORDER BY revenue DESC
  `, [day.id]);

  const tokens = await db.get(`
    SELECT COUNT(*)::int AS generated,
           COUNT(CASE WHEN status = 'BILLED' THEN 1 END)::int AS billed,
           COUNT(CASE WHEN status IN ('CANCELLED', 'NO_SHOW') THEN 1 END)::int AS cancelled,
           COUNT(CASE WHEN status = 'WAITING' THEN 1 END)::int AS waiting
    FROM walk_in_tokens WHERE business_day_id = ?
  `, [day.id]);

  const labels = Object.fromEntries((await listCategories(db, { includeInactive: true })).map((c) => [c.name, c.label]));
  const salaryHidden = forAdmin ? '' : `AND e.category NOT IN ('Staff Salary', 'Staff Commission')`;
  const expenseRows = await db.all(`
    SELECT e.id, e.title, e.category, e.amount, e.cash_amount, e.online_amount, e.payment_method, e.expense_date, e.created_at,
           COALESCE(u.full_name, u.username, '') AS created_by_name
    FROM expenses e LEFT JOIN users u ON u.id = e.created_by
    WHERE e.business_day_id = ? AND e.deleted_at IS NULL AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE' ${salaryHidden}
    ORDER BY e.created_at DESC, e.id DESC
  `, [day.id]);

  const movementRows = await db.all(`
    SELECT m.*, bd.business_date, ss.session_number, COALESCE(u.full_name, u.username, '') AS created_by_name
    FROM cash_movements m
    LEFT JOIN business_days bd ON bd.id = m.business_day_id
    LEFT JOIN store_sessions ss ON ss.id = m.store_session_id
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.business_day_id = ?
    ORDER BY m.created_at DESC, m.id DESC
  `, [day.id]);

  const savingsRows = await db.all(`
    SELECT s.id, s.deposit_type, s.source_account, s.amount, s.institution_name, s.created_at
    FROM savings_deposits s WHERE s.business_day_id = ? AND s.deleted_at IS NULL AND s.status = 'ACTIVE'
    ORDER BY s.created_at DESC
  `, [day.id]);

  const voids = await db.all(`
    SELECT fc.id, fc.amount, fc.reason, fc.created_at, fc.source_id AS bill_id, b.bill_number, COALESCE(u.full_name, u.username, '') AS by_name
    FROM financial_corrections fc
    LEFT JOIN salon_bills b ON b.id = fc.source_id
    LEFT JOIN users u ON u.id = fc.created_by
    WHERE fc.source_type = 'salon_bill' AND fc.correction_type = 'void' AND fc.business_day_id = ?
    ORDER BY fc.created_at DESC
  `, [day.id]);

  const netSales = round2(fin.netSalesAfterDiscount);
  const services = itemRows.filter((row) => row.item_type === 'service');
  const products = itemRows.filter((row) => row.item_type === 'product');
  const lastClosed = [...sessions].reverse().find((session) => session.status === 'CLOSED') || null;
  const anyOpen = sessions.some((session) => session.status === 'OPEN');

  const issues = [];
  sessions.forEach((session) => {
    if (session.forceClosed) issues.push({ tone: 'outflow', text: `Session ${session.sessionNumber} was force closed${session.forceCloseReason ? `: ${session.forceCloseReason}` : ''}.` });
    if (session.difference && session.difference !== 0) issues.push({ tone: session.difference < 0 ? 'outflow' : 'cash', text: `Session ${session.sessionNumber} counted ${session.difference < 0 ? 'short' : 'over'} by Rs ${Math.abs(session.difference).toFixed(2)}.` });
  });
  if (Number(tokens?.waiting || 0) > 0) issues.push({ tone: 'cash', text: `${tokens.waiting} token(s) were still waiting.` });
  if (voids.length) issues.push({ tone: 'cash', text: `${voids.length} bill(s) were cancelled (voided) on this day.` });

  const onlineIn = round2(numeric(fin.grossQrCollected) + numeric(fin.creditCollectionsOnline) + numeric(fin.exchangeOnlineIn));
  const onlineOut = round2(numeric(fin.onlineRefunds) + numeric(fin.operatingExpensesOnline) + numeric(fin.salaryExpensesOnline) + numeric(fin.savingsFromOnline) + numeric(fin.exchangeOnlineOut));

  return {
    day: {
      id: Number(day.id),
      businessDate: dateIso(day.business_date),
      status: anyOpen ? 'OPEN' : day.status,
      openedAt: day.opened_at,
      closedAt: day.closed_at || lastClosed?.closedAt || null,
      openedBy: day.opened_by_name || sessions[0]?.openedBy || '',
      closedBy: day.closed_by_name || lastClosed?.closedBy || '',
      notes: sessions.flatMap((session) => [
        session.openingNote ? { session: session.sessionNumber, kind: 'Opening note', text: session.openingNote } : null,
        session.closingNote ? { session: session.sessionNumber, kind: 'Closing note', text: session.closingNote } : null,
        session.forceCloseReason ? { session: session.sessionNumber, kind: 'Force-close reason', text: session.forceCloseReason } : null,
      ].filter(Boolean)),
    },
    sales: {
      grossBilled: round2(fin.grossSalesBeforeDiscount),
      discounts: round2(fin.totalDiscounts),
      loyaltyDiscounts: round2(fin.loyaltyDiscounts),
      tax: round2(fin.totalTax),
      serviceCharge: round2(fin.totalServiceCharge),
      finalizedTotal: round2(fin.finalizedBillTotal),
      voidedSales: round2(fin.voidedSales),
      voidCount: Number(fin.voidCount || 0),
      netSales,
      bills: Number(fin.bills || 0),
      averageBill: fin.bills > 0 ? round2(netSales / fin.bills) : 0,
      servicesSold: services.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      productsSold: products.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      creditSales: round2(fin.creditSales),
      visits: {
        walkIn: { bills: Number(visitRow?.token_bills || 0), amount: round2(visitRow?.token_sales) },
        appointment: { bills: Number(visitRow?.appointment_bills || 0), amount: round2(visitRow?.appointment_sales) },
        direct: { bills: Number(visitRow?.direct_bills || 0), amount: round2(visitRow?.direct_sales) },
      },
    },
    payments: {
      cash: round2(fin.grossCashCollected),
      online: round2(fin.grossQrCollected),
      esewaPhonePay: round2(fin.esewaPhonePayCollected),
      bankQr: round2(fin.bankQrCollected),
      creditSales: round2(fin.creditSales),
      creditCollectionsCash: round2(fin.creditCollectionsCash),
      creditCollectionsOnline: round2(fin.creditCollectionsOnline),
      totalCollected: round2(numeric(fin.grossTotalCollected) + numeric(fin.creditCollectionsCash) + numeric(fin.creditCollectionsOnline)),
      cashRefunds: round2(fin.cashRefunds),
      onlineRefunds: round2(fin.onlineRefunds),
      netRetained: round2(numeric(fin.grossTotalCollected) + numeric(fin.creditCollectionsCash) + numeric(fin.creditCollectionsOnline) - numeric(fin.cashRefunds) - numeric(fin.onlineRefunds)),
    },
    sessions,
    online: {
      in: onlineIn,
      out: onlineOut,
      net: round2(fin.netOnlineBalance),
      lines: [
        { label: 'Online / QR sales', value: round2(fin.grossQrCollected), sign: '+' },
        { label: 'Credit collected online', value: round2(fin.creditCollectionsOnline), sign: '+' },
        { label: 'Exchange — online received', value: round2(fin.exchangeOnlineIn), sign: '+' },
        { label: 'Online refunds', value: round2(fin.onlineRefunds), sign: '−' },
        { label: forAdmin ? 'Online expenses' : 'Online expenses & salary', value: forAdmin ? round2(fin.operatingExpensesOnline) : round2(numeric(fin.operatingExpensesOnline) + numeric(fin.salaryExpensesOnline)), sign: '−' },
        ...(forAdmin ? [{ label: 'Salary / advances paid online', value: round2(fin.salaryExpensesOnline), sign: '−' }] : []),
        { label: 'Online to savings', value: round2(fin.savingsFromOnline), sign: '−' },
        { label: 'Exchange — online sent', value: round2(fin.exchangeOnlineOut), sign: '−' },
      ],
    },
    outflows: {
      operatingExpenses: round2(fin.operatingExpenses),
      operatingExpensesCash: round2(fin.operatingExpensesCash),
      operatingExpensesOnline: round2(fin.operatingExpensesOnline),
      ...(forAdmin ? { salary: round2(fin.salaryExpenses), salaryCash: round2(fin.salaryExpensesCash), salaryOnline: round2(fin.salaryExpensesOnline) } : {}),
      savings: round2(fin.savingsTransfers),
      refunds: round2(numeric(fin.cashRefunds) + numeric(fin.onlineRefunds)),
    },
    cashMovements: {
      ownerCashIn: round2(fin.ownerCashIn),
      ownerCashOut: round2(fin.ownerCashOut),
      exchangeCashIn: round2(fin.exchangeCashIn),
      exchangeCashOut: round2(fin.exchangeCashOut),
      exchangeOnlineIn: round2(fin.exchangeOnlineIn),
      exchangeOnlineOut: round2(fin.exchangeOnlineOut),
      exchangeFees: round2(fin.exchangeFeeIncome),
      rows: movementRows.map(mapMovement),
    },
    services: {
      tokens: { generated: Number(tokens?.generated || 0), billed: Number(tokens?.billed || 0), cancelled: Number(tokens?.cancelled || 0), waiting: Number(tokens?.waiting || 0) },
      topServices: services.slice(0, 8).map((row) => ({ name: row.name, quantity: Number(row.quantity), amount: round2(row.amount) })),
      topProducts: products.slice(0, 5).map((row) => ({ name: row.name, quantity: Number(row.quantity), amount: round2(row.amount) })),
      staff: staffRows.map((row) => ({ staff: row.staff, services: Number(row.services), customers: Number(row.customers), revenue: round2(row.revenue), ...(forAdmin ? { commission: round2(row.commission) } : {}) })),
    },
    bills: bills.map((row) => ({
      id: Number(row.id), billNumber: row.bill_number, customer: row.customer_name || 'Walk-in', total: numeric(row.grand_total),
      paymentMethod: row.payment_method, status: row.status, time: row.transaction_time, cashier: row.cashier_name,
      staff: row.staff_names || '', items: row.items || '', source: row.appointment_id ? 'Appointment' : row.token_id ? 'Walk-in token' : 'Direct',
    })),
    expenses: expenseRows.map((row) => ({
      id: Number(row.id), title: row.title, category: labels[row.category] || row.category, amount: numeric(row.amount),
      cash: numeric(row.cash_amount), online: numeric(row.online_amount), paymentMethod: row.payment_method, createdBy: row.created_by_name, createdAt: row.created_at,
    })),
    savings: savingsRows.map((row) => ({ id: Number(row.id), type: row.deposit_type, source: row.source_account, amount: numeric(row.amount), institution: row.institution_name || '', createdAt: row.created_at })),
    voids: voids.map((row) => ({ id: Number(row.id), billId: Number(row.bill_id), billNumber: row.bill_number, amount: numeric(row.amount), reason: row.reason, by: row.by_name, at: row.created_at })),
    issues,
  };
}
