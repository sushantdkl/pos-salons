/**
 * SALON ANALYTICS — "What is driving the salon?"
 *
 * Composes the shared reporting services instead of re-deriving money:
 *   - every money KPI, payment mix, category mix, staff table and token count comes from
 *     getExecutiveSummary (-> getFinancialSummary), so Analytics can never disagree with
 *     Summary, Dashboard or Opening & Closing for the same period;
 *   - the sales trend comes from getSalesSeries (void-adjusted).
 * The queries below add only what those services do not carry: customer behaviour, top
 * services/products, stock position, token demand by hour, and control/exception counts.
 *
 * Scope rules are the Summary's: 'today' follows the current Business Day, every other
 * period uses Nepal calendar dates. Bill-level money is never joined to line items.
 */

import { BILL_DATE_EXPR_B, periodBoundsSql, periodDateColumnFilter, SALON_TIMEZONE } from '@/lib/db/postgres-dates';
import { getAnalyticsExtras } from '@/lib/reports/analytics-money';
import { getExecutiveSummary, INVENTORY_PURCHASE_CATEGORY } from '@/lib/reports/executive-summary';
import { eventScope, getSalesSeries, numeric, PAID_BILL_STATUS_SQL, revenueScope, soldBillSql } from '@/lib/reports/finance-summary';

const round2 = (value) => Math.round((numeric(value) + Number.EPSILON) * 100) / 100;
const pct = (part, whole) => (numeric(whole) > 0 ? Math.round((numeric(part) / numeric(whole)) * 1000) / 10 : 0);
const NEPAL_DATE = (column) => `((${column}) AT TIME ZONE '${SALON_TIMEZONE}')::date`;

/* ---------------------------------------------------------------- services */

async function getTopServices(db, period, scope) {
  const filter = revenueScope('b', period, scope);
  const rows = await db.all(`
    SELECT i.item_id, i.name,
           COALESCE(NULLIF(TRIM(s.category), ''), 'Uncategorised') AS category,
           COALESCE(SUM(i.quantity), 0)::int AS quantity,
           COALESCE(SUM(i.subtotal), 0) AS revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    LEFT JOIN salon_services s ON s.id = i.item_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND i.item_type = 'service'
    GROUP BY i.item_id, i.name, 3
  `, filter.params);
  const services = rows.map((row) => ({
    id: row.item_id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity || 0),
    revenue: round2(row.revenue),
    averageValue: Number(row.quantity) > 0 ? round2(numeric(row.revenue) / Number(row.quantity)) : 0,
  }));
  return {
    byRevenue: [...services].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    byQuantity: [...services].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10),
    distinctServices: services.length,
  };
}

/* --------------------------------------------------------------- customers */

/**
 * New vs returning is decided against the bill history itself, not customers.created_at:
 *   new       = the customer's first ever sold bill falls in this period
 *   returning = the customer had a sold bill BEFORE their first bill in this period
 * Walk-ins without a saved customer cannot be classified and are reported separately.
 */
async function getCustomerAnalytics(db, period, scope) {
  const filter = revenueScope('b', period, scope);
  const row = await db.get(`
    WITH period_customers AS (
      SELECT b.customer_id,
             MIN(${BILL_DATE_EXPR_B}) AS first_in_period,
             COUNT(b.id)::int AS bills,
             COALESCE(SUM(b.grand_total), 0) AS spend,
             ARRAY_AGG(b.id) AS bill_ids
      FROM salon_bills b
      WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND b.customer_id IS NOT NULL
      GROUP BY b.customer_id
    ),
    classified AS (
      SELECT pc.*,
             EXISTS (
               SELECT 1 FROM salon_bills b2
               WHERE b2.customer_id = pc.customer_id
                 AND ${soldBillSql('b2')}
                 AND COALESCE(b2.transaction_time, b2.created_at) < pc.first_in_period
                 AND NOT (b2.id = ANY(pc.bill_ids))
             ) AS is_returning
      FROM period_customers pc
    )
    SELECT
      COUNT(*)::int AS identified,
      COUNT(CASE WHEN NOT is_returning THEN 1 END)::int AS new_customers,
      COUNT(CASE WHEN is_returning THEN 1 END)::int AS returning_customers,
      COUNT(CASE WHEN bills >= 2 THEN 1 END)::int AS repeat_in_period,
      COALESCE(SUM(bills), 0)::int AS identified_bills,
      COALESCE(SUM(spend), 0) AS identified_spend
    FROM classified
  `, filter.params);

  const walkIns = await db.get(`
    SELECT COUNT(b.id)::int AS bills, COALESCE(SUM(b.grand_total), 0) AS spend
    FROM salon_bills b
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND b.customer_id IS NULL
  `, filter.params);

  const top = await db.all(`
    SELECT b.customer_id, COALESCE(c.name, MAX(b.customer_name), 'Customer') AS name,
           COUNT(b.id)::int AS bills, COALESCE(SUM(b.grand_total), 0) AS spend
    FROM salon_bills b
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND b.customer_id IS NOT NULL
    GROUP BY b.customer_id, c.name
    ORDER BY spend DESC, bills DESC
    LIMIT 10
  `, filter.params);

  const identified = Number(row?.identified || 0);
  const identifiedBills = Number(row?.identified_bills || 0);
  const walkInBills = Number(walkIns?.bills || 0);
  const totalBills = identifiedBills + walkInBills;
  return {
    identifiedCustomers: identified,
    newCustomers: Number(row?.new_customers || 0),
    returningCustomers: Number(row?.returning_customers || 0),
    walkInBills,
    customersServed: identified + walkInBills,
    // Share of identified customers who came back at least twice INSIDE this period.
    repeatWithinPeriodRate: pct(row?.repeat_in_period, identified),
    returningShare: pct(row?.returning_customers, identified),
    averageSpendPerBill: totalBills > 0 ? round2((numeric(row?.identified_spend) + numeric(walkIns?.spend)) / totalBills) : 0,
    visitsPerCustomer: identified > 0 ? Math.round((identifiedBills / identified) * 100) / 100 : 0,
    topCustomers: top.map((customer) => ({
      id: customer.customer_id,
      name: customer.name,
      bills: Number(customer.bills || 0),
      spend: round2(customer.spend),
    })),
  };
}

/** Distinct customers served per day for multi-day periods (walk-in bills count once each). */
async function getCustomerTrend(db, period, scope) {
  if (period === 'today') return [];
  const bounds = periodBoundsSql(period, scope.startDate, scope.endDate);
  const rows = await db.all(`
    WITH days AS (
      SELECT generate_series(${bounds.startSql}::date, (${bounds.endSql}::date - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
    ),
    bills AS (
      SELECT ${NEPAL_DATE(BILL_DATE_EXPR_B)} AS day, b.id, b.customer_id
      FROM salon_bills b
      WHERE ${PAID_BILL_STATUS_SQL}
        AND ${NEPAL_DATE(BILL_DATE_EXPR_B)} >= ${bounds.startSql} AND ${NEPAL_DATE(BILL_DATE_EXPR_B)} < ${bounds.endSql}
    )
    SELECT d.day::text AS day,
           (COUNT(DISTINCT bl.customer_id) + COUNT(CASE WHEN bl.id IS NOT NULL AND bl.customer_id IS NULL THEN 1 END))::int AS customers,
           COUNT(bl.id)::int AS bills
    FROM days d
    LEFT JOIN bills bl ON bl.day = d.day
    GROUP BY d.day
    ORDER BY d.day
  `, [...bounds.params, ...bounds.params]); // days (start, end) + bills (start, end)
  return rows.map((point) => {
    const [year, month, dayOfMonth] = String(point.day).slice(0, 10).split('-').map(Number);
    return {
      date: String(point.day).slice(0, 10),
      label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(year, month - 1, dayOfMonth))),
      customers: Number(point.customers || 0),
      bills: Number(point.bills || 0),
    };
  });
}

/* -------------------------------------------------------------- staff */

async function getStaffTickets(db, period, scope) {
  const filter = revenueScope('b', period, scope);
  const rows = await db.all(`
    SELECT i.staff_id, COUNT(DISTINCT b.id)::int AS bills
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND i.item_type = 'service' AND i.staff_id IS NOT NULL
    GROUP BY i.staff_id
  `, filter.params);
  return new Map(rows.map((row) => [String(row.staff_id), Number(row.bills || 0)]));
}

/* ----------------------------------------------------- products / inventory */

async function getProductAnalytics(db, period, scope) {
  const filter = revenueScope('b', period, scope);
  const top = await db.all(`
    SELECT i.item_id, i.name, COALESCE(SUM(i.quantity), 0)::int AS quantity, COALESCE(SUM(i.subtotal), 0) AS revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE ${filter.clause} AND ${PAID_BILL_STATUS_SQL} AND i.item_type = 'product'
    GROUP BY i.item_id, i.name
    ORDER BY revenue DESC, quantity DESC
    LIMIT 10
  `, filter.params);

  const stock = await db.get(`
    SELECT
      COUNT(*)::int AS active_products,
      COALESCE(SUM(CASE WHEN COALESCE(current_stock, 0) <= COALESCE(low_stock_threshold, 0) THEN 1 ELSE 0 END), 0)::int AS low_stock,
      COALESCE(SUM(CASE WHEN COALESCE(current_stock, 0) <= 0 THEN 1 ELSE 0 END), 0)::int AS out_of_stock,
      COALESCE(SUM(GREATEST(COALESCE(current_stock, 0), 0) * COALESCE(purchase_price, 0)), 0) AS stock_value,
      COALESCE(SUM(CASE WHEN COALESCE(current_stock, 0) > 0 AND COALESCE(purchase_price, 0) <= 0 THEN 1 ELSE 0 END), 0)::int AS uncosted_in_stock
    FROM salon_products
    WHERE status = 'active'
  `);

  const lowStock = await db.all(`
    SELECT id, name, category, current_stock, low_stock_threshold
    FROM salon_products
    WHERE status = 'active' AND COALESCE(current_stock, 0) <= COALESCE(low_stock_threshold, 0)
    ORDER BY current_stock ASC, name ASC
    LIMIT 10
  `);

  // inventory_movements has no business-day column, so it always uses calendar dates.
  const moveFilter = periodDateColumnFilter(period, NEPAL_DATE('im.created_at'), scope.startDate, scope.endDate);
  const movements = await db.all(`
    SELECT im.movement_type, COUNT(*)::int AS records, COALESCE(SUM(ABS(im.quantity)), 0)::int AS units
    FROM inventory_movements im
    WHERE ${moveFilter.clause}
    GROUP BY im.movement_type
    ORDER BY im.movement_type
  `, moveFilter.params);

  // Slow movers need history: only reported when bills exist for at least 30 days.
  const history = await db.get(`SELECT MIN(${BILL_DATE_EXPR_B}) AS first_bill FROM salon_bills b WHERE ${PAID_BILL_STATUS_SQL}`);
  const historyDays = history?.first_bill ? Math.floor((Date.now() - new Date(history.first_bill).getTime()) / 86400000) : 0;
  const slowMoving = historyDays >= 30 ? await db.all(`
    SELECT p.id, p.name, p.current_stock
    FROM salon_products p
    WHERE p.status = 'active' AND COALESCE(p.current_stock, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM salon_bill_items i JOIN salon_bills b ON b.id = i.bill_id
        WHERE i.item_type = 'product' AND i.item_id = p.id AND ${PAID_BILL_STATUS_SQL}
          AND ${BILL_DATE_EXPR_B} >= NOW() - INTERVAL '30 days'
      )
    ORDER BY p.current_stock DESC, p.name
    LIMIT 10
  `) : null;

  const stockValue = round2(stock?.stock_value);
  return {
    topProducts: top.map((row) => ({ id: row.item_id, name: row.name, quantity: Number(row.quantity || 0), revenue: round2(row.revenue) })),
    activeProducts: Number(stock?.active_products || 0),
    lowStockCount: Number(stock?.low_stock || 0),
    outOfStockCount: Number(stock?.out_of_stock || 0),
    // Reliable only when every in-stock product carries a purchase price.
    stockValue,
    stockValueComplete: Number(stock?.uncosted_in_stock || 0) === 0,
    uncostedInStock: Number(stock?.uncosted_in_stock || 0),
    lowStock: lowStock.map((row) => ({
      id: row.id, name: row.name, category: row.category,
      currentStock: Number(row.current_stock || 0), threshold: Number(row.low_stock_threshold || 0),
    })),
    movements: movements.map((row) => ({ type: row.movement_type, records: Number(row.records || 0), units: Number(row.units || 0) })),
    slowMoving: slowMoving ? slowMoving.map((row) => ({ id: row.id, name: row.name, currentStock: Number(row.current_stock || 0) })) : null,
    purchaseCategory: INVENTORY_PURCHASE_CATEGORY,
  };
}

/* ------------------------------------------------------------ front desk */

async function getTokenDemand(db, period, scope) {
  const filter = scope.businessDayId
    ? { clause: 'wt.business_day_id = ?', params: [scope.businessDayId] }
    : periodDateColumnFilter(period, 'wt.token_date', scope.startDate, scope.endDate);
  const rows = await db.all(`
    SELECT date_part('hour', wt.created_at AT TIME ZONE '${SALON_TIMEZONE}')::int AS hour,
           COUNT(*)::int AS tokens,
           COUNT(CASE WHEN wt.status = 'BILLED' THEN 1 END)::int AS converted
    FROM walk_in_tokens wt
    WHERE ${filter.clause}
    GROUP BY 1
    ORDER BY 1
  `, filter.params);
  return rows.map((row) => {
    const hour = Number(row.hour || 0);
    const suffix = hour < 12 ? 'AM' : 'PM';
    return { hour, label: `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`, tokens: Number(row.tokens || 0), converted: Number(row.converted || 0) };
  });
}

/* -------------------------------------------------------------- controls */

async function getControls(db, period, scope) {
  const billFilter = revenueScope('b', period, scope);
  const discounts = await db.get(`
    SELECT COUNT(CASE WHEN COALESCE(b.discount_amount, 0) > 0 THEN 1 END)::int AS discounted_bills,
           COALESCE(SUM(b.discount_amount), 0) AS discount_total,
           COALESCE(SUM(b.subtotal), 0) AS gross,
           COUNT(b.id)::int AS bills,
           COUNT(CASE WHEN b.backdated_by IS NOT NULL THEN 1 END)::int AS backdated_bills
    FROM salon_bills b
    WHERE ${billFilter.clause} AND ${PAID_BILL_STATUS_SQL}
  `, billFilter.params);

  const voidFilter = eventScope('fc', period, scope);
  const voids = await db.get(`
    SELECT COUNT(*)::int AS voids, COALESCE(SUM(fc.amount), 0) AS voided
    FROM financial_corrections fc
    WHERE fc.source_type = 'salon_bill' AND fc.correction_type = 'void' AND ${voidFilter.clause}
  `, voidFilter.params);

  const sessionFilter = scope.businessDayId
    ? { clause: 'ss.business_day_id = ?', params: [scope.businessDayId] }
    : periodDateColumnFilter(period, 'bd.business_date', scope.startDate, scope.endDate);
  const sessions = await db.get(`
    SELECT COUNT(ss.id)::int AS sessions,
           COUNT(CASE WHEN ss.session_number > 1 THEN 1 END)::int AS reopened,
           COUNT(CASE WHEN ss.status = 'CLOSED' AND ss.cash_difference < 0 THEN 1 END)::int AS shortages,
           COALESCE(SUM(CASE WHEN ss.status = 'CLOSED' AND ss.cash_difference < 0 THEN ss.cash_difference ELSE 0 END), 0) AS shortage_total,
           COUNT(CASE WHEN ss.status = 'CLOSED' AND ss.cash_difference > 0 THEN 1 END)::int AS overages,
           COALESCE(SUM(CASE WHEN ss.status = 'CLOSED' AND ss.cash_difference > 0 THEN ss.cash_difference ELSE 0 END), 0) AS overage_total,
           COUNT(CASE WHEN ss.force_closed THEN 1 END)::int AS force_closed
    FROM store_sessions ss
    JOIN business_days bd ON bd.id = ss.business_day_id
    WHERE ${sessionFilter.clause}
  `, sessionFilter.params);

  return {
    discountedBills: Number(discounts?.discounted_bills || 0),
    discountTotal: round2(discounts?.discount_total),
    discountRate: pct(discounts?.discount_total, discounts?.gross),
    discountedShare: pct(discounts?.discounted_bills, discounts?.bills),
    backdatedBills: Number(discounts?.backdated_bills || 0),
    voids: Number(voids?.voids || 0),
    voidedAmount: round2(voids?.voided),
    sessions: Number(sessions?.sessions || 0),
    reopenedSessions: Number(sessions?.reopened || 0),
    shortages: Number(sessions?.shortages || 0),
    shortageTotal: round2(sessions?.shortage_total),
    overages: Number(sessions?.overages || 0),
    overageTotal: round2(sessions?.overage_total),
    forceClosed: Number(sessions?.force_closed || 0),
  };
}

/* ------------------------------------------------------------ appointments */

/**
 * Appointments scheduled in the period (by appointment date; 'today' = today's calendar date).
 * Completion and no-show rates are over appointments whose outcome is known, so bookings
 * still in the future do not drag the rates down.
 */
async function getAppointmentStats(db, period, scope) {
  const filter = periodDateColumnFilter(period, 'a.appointment_date', scope.startDate, scope.endDate);
  const [statusRows, sourceRows] = await Promise.all([
    db.all(`SELECT a.status, COUNT(*)::int AS n FROM appointments a WHERE ${filter.clause} GROUP BY a.status`, filter.params),
    db.all(`SELECT a.source, COUNT(*)::int AS n FROM appointments a WHERE ${filter.clause} GROUP BY a.source ORDER BY n DESC`, filter.params),
  ]);
  const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, Number(row.n || 0)]));
  const booked = statusRows.reduce((sum, row) => sum + Number(row.n || 0), 0);
  const completed = byStatus.COMPLETED || 0;
  const cancelled = byStatus.CANCELLED || 0;
  const noShow = byStatus.NO_SHOW || 0;
  const resolved = completed + cancelled + noShow;
  return {
    booked,
    pending: byStatus.PENDING || 0,
    confirmed: byStatus.CONFIRMED || 0,
    inSalon: (byStatus.CHECKED_IN || 0) + (byStatus.IN_SERVICE || 0),
    completed,
    cancelled,
    noShow,
    completionRate: pct(completed, resolved),
    noShowRate: pct(noShow, resolved),
    sources: sourceRows.map((row) => ({ source: row.source, count: Number(row.n || 0) })),
  };
}

/* ------------------------------------------------------------ loyalty & reviews */

/**
 * Reviews submitted and loyalty activity recorded in the period (Nepal dates), plus current
 * outstanding rewards. Descriptive only — no claim that loyalty caused any sales.
 */
async function getCrmStats(db, period, scope) {
  const bounds = periodBoundsSql(period, scope.startDate, scope.endDate);
  const inPeriod = (column) => `(${column} AT TIME ZONE '${SALON_TIMEZONE}')::date >= ${bounds.startSql} AND (${column} AT TIME ZONE '${SALON_TIMEZONE}')::date < ${bounds.endSql}`;
  const [reviews, ratingRows, loyalty, discount, outstanding] = await Promise.all([
    db.get(`SELECT COUNT(*)::int AS n, AVG(overall_rating) AS avg, COUNT(*) FILTER (WHERE verified)::int AS verified
      FROM customer_reviews WHERE status <> 'ARCHIVED' AND ${inPeriod('submitted_at')}`, bounds.params),
    db.all(`SELECT overall_rating AS stars, COUNT(*)::int AS n FROM customer_reviews
      WHERE overall_rating IS NOT NULL AND status <> 'ARCHIVED' AND ${inPeriod('submitted_at')} GROUP BY 1`, bounds.params),
    db.get(`SELECT COUNT(*) FILTER (WHERE l.entry_type = 'EARN' AND NOT EXISTS (SELECT 1 FROM loyalty_ledger r WHERE r.reversal_of = l.id))::int AS earned,
        COUNT(*) FILTER (WHERE l.entry_type = 'REDEEM' AND NOT EXISTS (SELECT 1 FROM loyalty_ledger r WHERE r.reversal_of = l.id))::int AS redeemed,
        COUNT(DISTINCT l.customer_id) FILTER (WHERE l.entry_type = 'EARN')::int AS customers
      FROM loyalty_ledger l WHERE ${inPeriod('l.created_at')}`, bounds.params),
    db.get(`SELECT COALESCE(SUM(b.loyalty_discount), 0) AS total FROM salon_bills b WHERE b.status = 'paid' AND ${inPeriod('b.transaction_time')}`, bounds.params),
    db.get(`SELECT COUNT(*) FILTER (WHERE x.balance >= x.required)::int AS ready, COALESCE(SUM(GREATEST(x.balance, 0) / x.required), 0)::int AS rewards,
        COUNT(*) FILTER (WHERE x.balance >= 0 AND x.balance % x.required = x.required - 1)::int AS near
      FROM (SELECT l.customer_id, p.required_visits AS required, SUM(l.visits) AS balance FROM loyalty_ledger l JOIN loyalty_programs p ON p.id = l.program_id
            WHERE p.is_active GROUP BY l.customer_id, p.id, p.required_visits) x`),
  ]);
  const counts = Object.fromEntries([5, 4, 3, 2, 1].map((stars) => [stars, Number(ratingRows.find((row) => Number(row.stars) === stars)?.n || 0)]));
  const earnedRewards = Number(loyalty?.redeemed || 0) + Number(outstanding?.rewards || 0);
  return {
    reviews: { count: Number(reviews?.n || 0), average: reviews?.avg ? round2(reviews.avg) : null, verified: Number(reviews?.verified || 0), ratings: counts },
    loyalty: {
      stampsEarned: Number(loyalty?.earned || 0),
      rewardsRedeemed: Number(loyalty?.redeemed || 0),
      customersEarning: Number(loyalty?.customers || 0),
      loyaltyDiscount: round2(discount?.total),
      outstandingRewards: Number(outstanding?.rewards || 0),
      customersWithReward: Number(outstanding?.ready || 0),
      customersNearReward: Number(outstanding?.near || 0),
      redemptionRate: earnedRewards ? pct(loyalty?.redeemed, earnedRewards) : null,
    },
  };
}

/* ---------------------------------------------------------- orchestration */

export async function getSalonAnalytics(db, period, options = {}) {
  const scope = {
    startDate: options.startDate || null,
    endDate: options.endDate || null,
    businessDayId: period === 'today' && options.businessDayId ? options.businessDayId : null,
  };

  const [summary, salesSeries, services, customers, customerTrend, staffTickets, products, tokenDemand, controls, appointments, crm, extras] = await Promise.all([
    getExecutiveSummary(db, period, { ...options, scope: 'admin' }),
    getSalesSeries(db, period, scope),
    getTopServices(db, period, scope),
    getCustomerAnalytics(db, period, scope),
    getCustomerTrend(db, period, scope),
    getStaffTickets(db, period, scope),
    getProductAnalytics(db, period, scope),
    getTokenDemand(db, period, scope),
    getControls(db, period, scope),
    getAppointmentStats(db, period, scope),
    getCrmStats(db, period, scope),
    getAnalyticsExtras(db, period, scope),
  ]);

  const { revenue, payments, expenses, salary, tokens, savings } = summary;
  const serviceRevenue = numeric(revenue.serviceRevenue);
  const productRevenue = numeric(revenue.productRevenue);

  return {
    generatedAt: summary.generatedAt,
    period: summary.period,
    businessDay: summary.businessDay,
    kpis: {
      grossSales: revenue.grossSalesBeforeDiscount,
      discounts: revenue.totalDiscounts,
      voids: revenue.voidedSales,
      netSales: revenue.netSales,
      expenses: expenses.total,
      payroll: salary?.totalPaid ?? 0,
      netCollection: payments.netReceived,
      bills: revenue.bills,
      customersServed: customers.customersServed,
      averageBill: revenue.avgBill,
    },
    payments: {
      cash: payments.grossCashCollected,
      online: payments.grossQrCollected,
      splitCash: payments.splitCash,
      splitOnline: payments.splitQr,
      credit: revenue.creditSales,
      creditCollected: round2(numeric(payments.creditCollectionsCash) + numeric(payments.creditCollectionsOnline)),
      netCash: payments.netCashReceived,
      netOnline: payments.netOnlineReceived,
      esewaPhonePay: payments.esewaPhonePay,
      bankQr: payments.bankQr,
    },
    salesTrend: salesSeries,
    services: {
      ...services,
      categories: summary.serviceCategories,
      servicesSold: revenue.servicesSold,
      serviceRevenue,
      averageServiceValue: revenue.servicesSold > 0 ? round2(serviceRevenue / revenue.servicesSold) : 0,
      serviceShare: pct(serviceRevenue, serviceRevenue + productRevenue),
      productShare: pct(productRevenue, serviceRevenue + productRevenue),
    },
    customers: { ...customers, trend: customerTrend, crm },
    staff: (summary.staffPerformance || []).map((member) => {
      const bills = staffTickets.get(String(member.staffId)) || 0;
      return { ...member, bills, averageTicket: bills > 0 ? round2(member.revenue / bills) : 0 };
    }),
    products: {
      ...products,
      productsSold: revenue.productsSold,
      productRevenue,
      categories: summary.productCategories,
      purchaseValue: summary.purchases?.totalPurchase ?? 0,
      unitsRestocked: summary.purchases?.unitsRestocked ?? 0,
    },
    expenses: { total: expenses.total, categories: expenses.categories || [] },
    savings: { total: savings.total },
    tokens: {
      generated: tokens.generated,
      converted: tokens.converted,
      cancelled: tokens.cancelled,
      noShow: tokens.noShow,
      waitingNow: tokens.waitingNow,
      conversionRate: pct(tokens.converted, tokens.generated),
      directBills: summary.quantities.directBills,
      tokenBills: summary.quantities.tokenBills,
      byHour: tokenDemand,
    },
    appointments,
    // Owner money view — the Summary's own figures, so Analytics and Summary always agree.
    money: {
      revenue: {
        grossSales: revenue.grossSalesBeforeDiscount,
        discounts: revenue.totalDiscounts,
        loyaltyDiscounts: revenue.loyaltyDiscounts,
        tax: revenue.totalTax,
        serviceCharge: revenue.totalServiceCharge,
        finalizedTotal: revenue.finalizedBillTotal,
        voids: revenue.voidedSales,
        voidCount: revenue.voidCount,
        netSales: revenue.netSales,
        creditSales: revenue.creditSales,
        serviceRevenue: revenue.serviceRevenue,
        productRevenue: revenue.productRevenue,
      },
      payments: {
        cash: payments.grossCashCollected,
        online: payments.grossQrCollected,
        esewaPhonePay: payments.esewaPhonePay,
        bankQr: payments.bankQr,
        creditCollectionsCash: payments.creditCollectionsCash,
        creditCollectionsOnline: payments.creditCollectionsOnline,
        cashRefunds: payments.cashRefunds,
        onlineRefunds: payments.onlineRefunds,
        refunds: round2(numeric(payments.cashRefunds) + numeric(payments.onlineRefunds)),
        netCash: payments.netCashReceived,
        netOnline: payments.netOnlineReceived,
        netReceived: payments.netReceived,
      },
      expenses: { total: expenses.total, cash: expenses.cash, online: expenses.online, records: expenses.records, excludingPurchases: round2(numeric(expenses.total) - numeric(summary.purchases?.totalPurchase)) },
      purchases: { total: summary.purchases?.totalPurchase ?? 0, records: summary.purchases?.records ?? 0 },
      salary: { total: salary?.totalPaid ?? 0, cash: salary?.totalCash ?? 0, online: salary?.totalOnline ?? 0, commissionAccrued: salary?.commissionAccrued ?? 0 },
      savings: { total: savings.total, fromCash: savings.fromCash, fromOnline: savings.fromOnline, records: savings.records },
      cashPosition: summary.cashPosition,
      onlinePosition: summary.onlinePosition,
      receivables: summary.customerCredit?.outstandingNow ?? 0,
      payables: extras.payables,
      profitLoss: summary.profitLoss,
    },
    sources: extras.sources,
    paymentSummary: extras.paymentSummary,
    byHour: extras.byHour,
    byWeekday: extras.byWeekday,
    paymentRecords: extras.paymentRecords,
    cancellations: extras.cancellations,
    controls: { ...controls, cashAdded: summary.cashPosition.cashAdded, cashRemoved: summary.cashPosition.cashRemoved, cancelledTokens: tokens.cancelled },
  };
}
