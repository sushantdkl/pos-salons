import { BILL_DATE_EXPR_B, periodDateColumnFilter, periodDateFilter } from '@/lib/db/postgres-dates';
import { getDashboardPeriodMeta, resolveDashboardPeriod, salonDateString } from '@/lib/reports/dashboard-period';
import {
  billCashSql,
  billQrSql,
  billScope,
  getFinancialSummary,
  numeric,
  PAID_BILL_STATUS_SQL,
  PAID_BILL_STATUS_SQL_SB,
  paymentMethodLabel,
  qrTypeLabel,
  revenueScope,
} from '@/lib/reports/finance-summary';

export { PAID_BILL_STATUS_SQL, PAID_BILL_STATUS_SQL_SB, paymentMethodLabel, qrTypeLabel };

export async function getSalonDashboardSummary(db, periodValue, options = {}) {
  const period = resolveDashboardPeriod(periodValue);
  const { startDate = null, endDate = null } = options;
  // Current-day metrics follow the open Business Day (accumulating across its sessions and
  // resetting only when a new day starts). Every other period stays on the calendar so
  // historical reports are untouched. Null businessDayId falls back to calendar today.
  const useDay = period === 'today' && options.businessDayId ? options.businessDayId : null;
  const periodMeta = getDashboardPeriodMeta(period, startDate, endDate);
  // Revenue attribution: a backdated bill belongs to the day the service happened, not to
  // the day whose drawer took the cash. Collections keep the cash attribution below.
  const billFilter = revenueScope('b', period, { businessDayId: useDay, startDate, endDate });
  const cashFilter = billScope('b', period, { businessDayId: useDay, startDate, endDate });
  const itemFilter = billFilter;
  const tokenFilter = useDay
    ? { clause: 'wt.business_day_id = ?', params: [useDay] }
    : periodDateColumnFilter(period, 'wt.token_date', startDate, endDate);
  const expenseFilter = useDay
    ? { clause: 'business_day_id = ?', params: [useDay] }
    : periodDateColumnFilter(period, 'expense_date', startDate, endDate);
  const recentExpenseFilter = useDay
    ? { clause: 'e.business_day_id = ?', params: [useDay] }
    : periodDateColumnFilter(period, 'e.expense_date', startDate, endDate);
  const today = salonDateString();
  const expenseCreatedBy = options.expenseCreatedBy ? 'AND created_by = ?' : '';
  const recentExpenseCreatedBy = options.expenseCreatedBy ? 'AND e.created_by = ?' : '';
  const expenseParams = options.expenseCreatedBy ? [...expenseFilter.params, options.expenseCreatedBy] : expenseFilter.params;
  const recentExpenseParams = options.expenseCreatedBy ? [...recentExpenseFilter.params, options.expenseCreatedBy] : recentExpenseFilter.params;

  const billCash = billCashSql('b');
  const billQr = billQrSql('b');

  // Revenue-scoped: what the salon SOLD in this period.
  const sales = await db.get(`
    SELECT
      COUNT(DISTINCT b.id)::int as bills,
      COALESCE(SUM(b.grand_total), 0) as total_sales,
      COALESCE(SUM(b.subtotal), 0) as gross_before_discount,
      COALESCE(SUM(b.discount_amount), 0) as total_discounts,
      COUNT(DISTINCT CASE WHEN b.token_id IS NULL THEN b.id END)::int as direct_bills,
      COUNT(DISTINCT CASE WHEN b.token_id IS NOT NULL THEN b.id END)::int as token_bills,
      COUNT(DISTINCT b.customer_id)::int as saved_customers,
      COUNT(DISTINCT CASE WHEN b.customer_id IS NULL THEN b.id END)::int as anonymous_customer_bills,
      CASE WHEN COUNT(DISTINCT b.id) > 0 THEN COALESCE(SUM(b.grand_total), 0) / COUNT(DISTINCT b.id) ELSE 0 END as avg_bill_value
    FROM salon_bills b
    WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, billFilter.params);

  // Cash-scoped: what the drawer / online accounts actually RECEIVED in this period.
  const collections = await db.get(`
    SELECT
      COALESCE(SUM(${billCash}), 0) as cash_received,
      COALESCE(SUM(${billQr}), 0) as qr_received,
      COALESCE(SUM(CASE WHEN b.qr_type = 'ESEWA_PHONEPAY' THEN ${billQr} ELSE 0 END), 0) as esewa_phonepay_received,
      COALESCE(SUM(CASE WHEN b.qr_type = 'BANK' THEN ${billQr} ELSE 0 END), 0) as bank_qr_received,
      COALESCE(SUM(CASE WHEN b.payment_method = 'split' THEN ${billCash} ELSE 0 END), 0) as split_cash,
      COALESCE(SUM(CASE WHEN b.payment_method = 'split' THEN ${billQr} ELSE 0 END), 0) as split_qr
    FROM salon_bills b
    WHERE ${cashFilter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, cashFilter.params);

  const itemCounts = await db.get(`
    SELECT
      COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.quantity ELSE 0 END), 0)::int as services_sold,
      COALESCE(SUM(CASE WHEN i.item_type = 'product' THEN i.quantity ELSE 0 END), 0)::int as products_sold,
      COALESCE(SUM(CASE WHEN i.item_type = 'service' THEN i.subtotal ELSE 0 END), 0) as service_revenue,
      COALESCE(SUM(CASE WHEN i.item_type = 'product' THEN i.subtotal ELSE 0 END), 0) as product_revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE ${itemFilter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, itemFilter.params);

  const tokens = await db.get(`
    SELECT
      COUNT(DISTINCT wt.id)::int as generated,
      COUNT(DISTINCT CASE WHEN wt.status IN ('CANCELLED', 'NO_SHOW') THEN wt.id END)::int as cancelled_no_show,
      COUNT(DISTINCT CASE WHEN COALESCE(wt.is_printed, FALSE) = FALSE THEN wt.id END)::int as digital_tokens,
      COUNT(DISTINCT CASE WHEN COALESCE(wt.is_printed, FALSE) = TRUE THEN wt.id END)::int as printed_tokens,
      COUNT(DISTINCT CASE
        WHEN wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NOT NULL THEN wt.id
      END)::int as converted,
      COUNT(DISTINCT CASE
        WHEN wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NOT NULL AND COALESCE(sb.is_printed, FALSE) = FALSE THEN sb.id
      END)::int as digital_bills,
      COUNT(DISTINCT CASE
        WHEN wt.status = 'BILLED' AND wt.invoice_id IS NOT NULL AND sb.id IS NOT NULL AND COALESCE(sb.is_printed, FALSE) = TRUE THEN sb.id
      END)::int as printed_bills
    FROM walk_in_tokens wt
    LEFT JOIN salon_bills sb
      ON sb.id = wt.invoice_id
     AND sb.token_id = wt.id
     AND ${PAID_BILL_STATUS_SQL_SB}
    WHERE ${tokenFilter.clause}
  `, tokenFilter.params);

  const waiting = useDay
    ? await db.get(`
        SELECT COUNT(DISTINCT wt.id)::int as waiting
        FROM walk_in_tokens wt
        WHERE wt.business_day_id = ? AND wt.status = 'WAITING'
      `, [useDay])
    : await db.get(`
        SELECT COUNT(DISTINCT wt.id)::int as waiting
        FROM walk_in_tokens wt
        WHERE wt.token_date = ?::date AND wt.status = 'WAITING'
      `, [today]);

  // Savings live in savings_deposits now, so operating expenses read EXPENSE rows only.
  const financial = await getFinancialSummary(db, period, {
    createdBy: options.expenseCreatedBy || null,
    includeSalary: options.includeSalary !== false,
    businessDayId: useDay,
    startDate,
    endDate,
  });

  const expenseBreakdown = await db.all(`
    SELECT category, COALESCE(record_type, 'EXPENSE') as record_type, COALESCE(SUM(amount), 0) as amount, COUNT(*)::int as records
    FROM expenses
    WHERE deleted_at IS NULL
      AND COALESCE(record_type, 'EXPENSE') = 'EXPENSE'
      AND ${expenseFilter.clause} ${expenseCreatedBy}
    GROUP BY category, COALESCE(record_type, 'EXPENSE')
    ORDER BY category ASC
  `, expenseParams);

  // Build the savings filter once so its custom-range params ($1/$2) are actually bound.
  const savingsFilter = useDay
    ? { clause: 's.business_day_id = ?', params: [useDay] }
    : periodDateColumnFilter(period, 's.deposit_date', startDate, endDate);
  const savingsParams = options.expenseCreatedBy ? [...savingsFilter.params, options.expenseCreatedBy] : savingsFilter.params;
  const savingsBreakdown = await db.all(`
    SELECT s.deposit_type, s.source_account, COALESCE(SUM(s.amount), 0) as amount, COUNT(s.id)::int as records
    FROM savings_deposits s
    WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
      AND ${savingsFilter.clause}
      ${options.expenseCreatedBy ? 'AND s.created_by = ?' : ''}
    GROUP BY s.deposit_type, s.source_account
    ORDER BY s.deposit_type ASC
  `, savingsParams);

  const recentExpenses = await db.all(`
    SELECT e.id, e.title, e.category, e.amount, e.record_type, e.expense_date, e.created_at
    FROM expenses e
    WHERE e.deleted_at IS NULL
      AND COALESCE(e.record_type, 'EXPENSE') = 'EXPENSE'
      AND ${recentExpenseFilter.clause} ${recentExpenseCreatedBy}
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 8
  `, recentExpenseParams);

  const recentCustomers = await db.all(`
    SELECT c.id, c.name, c.phone, c.total_visits, c.total_spent, MAX(${BILL_DATE_EXPR_B}) as last_visit
    FROM salon_bills b
    JOIN customers c ON c.id = b.customer_id
    WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
    GROUP BY c.id, c.name, c.phone, c.total_visits, c.total_spent
    ORDER BY last_visit DESC, c.id DESC
    LIMIT 8
  `, billFilter.params);

  const staffActivity = await db.all(`
    SELECT
      i.staff_id as staff_id,
      COALESCE(NULLIF(sp.display_name, ''), u.full_name, 'Unknown Staff') as staff_name,
      COALESCE(NULLIF(sp.salon_role, ''), u.role, 'staff') as staff_role,
      COUNT(i.id)::int as services_completed,
      COUNT(DISTINCT COALESCE(b.customer_id::text, NULLIF(b.customer_name, ''), b.id::text))::int as customers_served,
      COALESCE(SUM(i.subtotal), 0) as revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    JOIN users u ON u.id = i.staff_id
    LEFT JOIN staff_profiles sp ON sp.user_id = i.staff_id
    WHERE ${itemFilter.clause}
      AND ${PAID_BILL_STATUS_SQL}
      AND i.item_type = 'service'
      AND i.staff_id IS NOT NULL
      AND (u.role IN ('barber', 'stylist', 'beautician') OR sp.salon_role IN ('barber', 'stylist', 'beautician'))
    GROUP BY i.staff_id, staff_name, staff_role
    ORDER BY revenue DESC, services_completed DESC, staff_name ASC
  `, itemFilter.params);

  const lowStock = await db.all(`
    SELECT id, name, current_stock, low_stock_threshold
    FROM salon_products
    WHERE status = 'active'
      AND COALESCE(current_stock, 0) <= COALESCE(low_stock_threshold, 0)
    ORDER BY current_stock ASC, name ASC
    LIMIT 6
  `);

  const tokenMismatch = await db.get(`
    SELECT COUNT(DISTINCT wt.id)::int as count
    FROM walk_in_tokens wt
    LEFT JOIN salon_bills sb
      ON sb.id = wt.invoice_id
     AND sb.token_id = wt.id
     AND ${PAID_BILL_STATUS_SQL_SB}
    WHERE ${tokenFilter.clause}
      AND wt.status = 'BILLED'
      AND (wt.invoice_id IS NULL OR sb.id IS NULL)
  `, tokenFilter.params);

  const billsMissingStaff = await db.get(`
    SELECT COUNT(DISTINCT b.id)::int as count
    FROM salon_bills b
    JOIN salon_bill_items i ON i.bill_id = b.id
    WHERE ${itemFilter.clause}
      AND ${PAID_BILL_STATUS_SQL}
      AND i.item_type = 'service'
      AND i.staff_id IS NULL
  `, itemFilter.params);

  const onlineMissingQr = await db.get(`
    SELECT COUNT(DISTINCT b.id)::int as count
    FROM salon_bills b
    WHERE ${billFilter.clause}
      AND ${PAID_BILL_STATUS_SQL}
      AND (
        (b.payment_method = 'online' AND (b.qr_type IS NULL OR b.qr_type = ''))
        OR (b.payment_method = 'split' AND COALESCE(b.qr_amount, 0) > 0 AND (b.qr_type IS NULL OR b.qr_type = ''))
      )
  `, billFilter.params);

  const serviceRevenue = numeric(itemCounts?.service_revenue);
  const productRevenue = numeric(itemCounts?.product_revenue);
  const totalItemRevenue = serviceRevenue + productRevenue;

  return {
    today,
    period: periodMeta,
    financial,
    summary: {
      totalBills: Number(sales?.bills || 0),
      totalSales: numeric(sales?.total_sales),
      grossSalesBeforeDiscount: numeric(sales?.gross_before_discount),
      totalDiscounts: numeric(sales?.total_discounts),
      netSalesAfterDiscount: numeric(sales?.total_sales),
      cashReceived: numeric(collections?.cash_received),
      qrReceived: numeric(collections?.qr_received),
      grossTotalCollected: numeric(collections?.cash_received) + numeric(collections?.qr_received),
      esewaPhonePayReceived: numeric(collections?.esewa_phonepay_received),
      bankQrReceived: numeric(collections?.bank_qr_received),
      splitCash: numeric(collections?.split_cash),
      splitQr: numeric(collections?.split_qr),
      tokenBills: Number(sales?.token_bills || 0),
      directBills: Number(sales?.direct_bills || 0),
      customersServed: Number(sales?.saved_customers || 0) + Number(sales?.anonymous_customer_bills || 0),
      savedCustomers: Number(sales?.saved_customers || 0),
      anonymousCustomerBills: Number(sales?.anonymous_customer_bills || 0),
      avgBillValue: numeric(sales?.avg_bill_value),
      servicesSold: Number(itemCounts?.services_sold || 0),
      productsSold: Number(itemCounts?.products_sold || 0),
      serviceRevenue,
      productRevenue,
      tokensGenerated: Number(tokens?.generated || 0),
      tokensConverted: Number(tokens?.converted || 0),
      tokensCancelledNoShow: Number(tokens?.cancelled_no_show || 0),
      digitalTokens: Number(tokens?.digital_tokens || 0),
      printedTokens: Number(tokens?.printed_tokens || 0),
      digitalBills: Number(tokens?.digital_bills || 0),
      printedBills: Number(tokens?.printed_bills || 0),
      dailyPettyExpenses: financial.operatingExpenses,
      operatingExpenses: financial.operatingExpenses,
      salaryExpenses: financial.salaryExpenses,
      dailySaving: financial.savingsTransfers,
      savingsTransfers: financial.savingsTransfers,
      savingsFromCash: financial.savingsFromCash,
      savingsFromOnline: financial.savingsFromOnline,
      // Cash MOVEMENT for the period (collections less cash paid out). The physical drawer
      // position is Expected Cash in Drawer, which adds the store session's starting float.
      netCashMovement: financial.netCashMovement,
      netCashInHand: financial.netCashMovement,
      netOnlineBalance: financial.netOnlineBalance,
      netAvailableBalance: financial.netAvailableBalance,
      currentWaitingTokens: Number(waiting?.waiting || 0),
    },
    revenueSources: [
      { type: 'service', amount: serviceRevenue, percentage: totalItemRevenue > 0 ? Math.round((serviceRevenue / totalItemRevenue) * 100) : 0 },
      { type: 'product', amount: productRevenue, percentage: totalItemRevenue > 0 ? Math.round((productRevenue / totalItemRevenue) * 100) : 0 },
    ].filter((source) => source.amount > 0),
    staffActivity: staffActivity.map((row) => ({
      staffId: row.staff_id,
      staffName: row.staff_name,
      role: row.staff_role,
      servicesCompleted: Number(row.services_completed || 0),
      customersServed: Number(row.customers_served || 0),
      revenue: numeric(row.revenue),
    })),
    expenseBreakdown: expenseBreakdown.map((row) => ({
      category: row.category,
      recordType: row.record_type || 'EXPENSE',
      amount: numeric(row.amount),
      records: Number(row.records || 0),
    })),
    savingsBreakdown: savingsBreakdown.map((row) => ({
      depositType: row.deposit_type,
      sourceAccount: row.source_account,
      amount: numeric(row.amount),
      records: Number(row.records || 0),
    })),
    recentCustomers,
    recentExpenses: recentExpenses.map((expense) => ({ ...expense, amount: numeric(expense.amount) })),
    alerts: {
      lowStock: lowStock.map((product) => ({
        id: product.id,
        name: product.name,
        currentStock: Number(product.current_stock || 0),
        lowStockThreshold: Number(product.low_stock_threshold || 0),
      })),
      billsMissingStaff: Number(billsMissingStaff?.count || 0),
      onlineMissingQr: Number(onlineMissingQr?.count || 0),
      tokenMismatch: Number(tokenMismatch?.count || 0),
    },
  };
}

export async function getDashboardTransactions(db, periodValue, options = {}) {
  const period = resolveDashboardPeriod(periodValue);
  const useDay = period === 'today' && options.businessDayId ? options.businessDayId : null;
  // Listed under the day the sale belongs to, matching the revenue figures above.
  const billFilter = revenueScope('b', period, {
    businessDayId: useDay,
    startDate: options.startDate || null,
    endDate: options.endDate || null,
  });
  const limit = Number(options.limit || 10);
  const bills = await db.all(`
    SELECT b.id, b.bill_number, b.customer_name, b.customer_phone, b.grand_total, b.payment_method,
           ${billCashSql('b')} as cash_amount, ${billQrSql('b')} as qr_amount,
           b.qr_type, b.token_id, b.subtotal, b.discount_amount, b.tax, b.service_charge, b.status,
           b.is_printed, t.token_number, COALESCE(cb.full_name, cb.username, '') as created_by_name,
           ${BILL_DATE_EXPR_B} as transaction_date
    FROM salon_bills b
    LEFT JOIN walk_in_tokens t ON t.id = b.token_id
    LEFT JOIN users cb ON cb.id = b.cashier_id
    WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
    ORDER BY ${BILL_DATE_EXPR_B} DESC, b.id DESC
    LIMIT ${limit}
  `, billFilter.params);

  const billIds = bills.map((bill) => bill.id);
  const items = billIds.length
    ? await db.all(`
        SELECT i.bill_id, i.item_type, i.name, i.quantity, i.subtotal,
               COALESCE(NULLIF(i.staff_name_snapshot, ''), NULLIF(sp.display_name, ''), u.full_name, '') as staff_name
        FROM salon_bill_items i
        LEFT JOIN users u ON u.id = i.staff_id
        LEFT JOIN staff_profiles sp ON sp.user_id = i.staff_id
        WHERE i.bill_id IN (${billIds.map(() => '?').join(',')})
        ORDER BY i.id ASC
      `, billIds)
    : [];

  const byBill = items.reduce((acc, item) => {
    const key = String(item.bill_id);
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      type: item.item_type,
      name: item.name,
      quantity: Number(item.quantity || 0),
      subtotal: numeric(item.subtotal),
      staffName: item.staff_name || '',
    });
    return acc;
  }, {});

  return bills.map((bill) => ({
    ...bill,
    grand_total: numeric(bill.grand_total),
    subtotal: numeric(bill.subtotal),
    cash_amount: numeric(bill.cash_amount),
    qr_amount: numeric(bill.qr_amount),
    discount_amount: numeric(bill.discount_amount),
    tax: numeric(bill.tax),
    service_charge: numeric(bill.service_charge),
    paymentLabel: paymentMethodLabel(bill.payment_method),
    qrTypeLabel: qrTypeLabel(bill.qr_type),
    items: byBill[String(bill.id)] || [],
  }));
}
