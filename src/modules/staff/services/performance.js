import { BILL_DATE_EXPR_B, STAFF_PERF_PERIODS, periodDateFilter } from '@/lib/db/postgres-dates';
import { billCashSql, billQrSql } from '@/lib/reports/finance-summary';

// A bill's actual cash / QR collection, allocated to one service line by that line's share of the
// whole bill (pre-discount subtotals). Summed per employee this is the cash and QR that came in
// from that employee's services — their "cash in hand" contribution.
const ITEM_CASH_SQL = `(${billCashSql('b')}) * (i.subtotal / NULLIF(b.subtotal, 0))`;
const ITEM_QR_SQL = `(${billQrSql('b')}) * (i.subtotal / NULLIF(b.subtotal, 0))`;

function emptyMetric() {
  return {
    servicesCompleted: 0,
    customersServed: 0,
    revenue: 0,
    commission: 0,
  };
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getStaffPerformance(db, staffId, options = {}) {
  const metrics = {};
  for (const [period, clause] of Object.entries(STAFF_PERF_PERIODS)) {
    const row = await db.get(`
      SELECT COUNT(i.id)::int as "servicesCompleted",
             COUNT(DISTINCT b.customer_id)::int as "customersServed",
             COALESCE(SUM(i.subtotal), 0) as revenue,
             COALESCE(SUM(i.commission_amount), 0) as commission
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE i.item_type = 'service'
        AND i.staff_id = ?
        AND b.status = 'paid'
        AND ${clause}
    `, [staffId]);
    metrics[period] = { ...emptyMetric(), ...row };
  }

  const recentServices = await db.all(`
    SELECT b.customer_name as "customerName",
           i.name as "serviceName",
           b.bill_number as invoice,
           ${BILL_DATE_EXPR_B} as date,
           i.subtotal as revenue,
           i.commission_amount as commission
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service'
      AND i.staff_id = ?
      AND b.status = 'paid'
    ORDER BY ${BILL_DATE_EXPR_B} DESC
    LIMIT 12
  `, [staffId]);

  const daysRow = await db.get(`
    SELECT COUNT(DISTINCT (${BILL_DATE_EXPR_B})::date)::int as count
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service' AND i.staff_id = ? AND b.status = 'paid'
  `, [staffId]);
  const daysActive = Math.max(1, Number(daysRow?.count || 1));
  const reportFilter = periodDateFilter(
    options.period || 'today',
    options.startDate,
    options.endDate,
    BILL_DATE_EXPR_B
  );
  const reportRows = await db.all(`
    SELECT ${BILL_DATE_EXPR_B} as date,
           b.bill_number as invoice,
           b.customer_name as "customerName",
           i.name as "serviceName",
           i.subtotal as amount,
           i.commission_amount as commission,
           ${ITEM_CASH_SQL} as cash,
           ${ITEM_QR_SQL} as qr,
           b.payment_method as "paymentMethod",
           b.payment_status as "paymentStatus"
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service'
      AND i.staff_id = ?
      AND b.status = 'paid'
      AND ${reportFilter.clause}
    ORDER BY ${BILL_DATE_EXPR_B} DESC, i.id DESC
    LIMIT 500
  `, [staffId, ...reportFilter.params]);
  const uniqueCustomers = new Set(reportRows.map((row) => row.customerName || 'Walk-in Customer')).size;

  return {
    metrics,
    recentServices: recentServices.map((row) => ({
      ...row,
      revenue: numeric(row.revenue),
      commission: numeric(row.commission),
    })),
    summary: {
      averageServicesPerDay: metrics.lifetime.servicesCompleted / daysActive,
      averageRevenuePerDay: metrics.lifetime.revenue / daysActive,
    },
    report: {
      period: options.period || 'today',
      rows: reportRows.map((row) => ({
        ...row,
        amount: numeric(row.amount),
        commission: numeric(row.commission),
        cash: numeric(row.cash),
        qr: numeric(row.qr),
      })),
      totals: {
        services: reportRows.length,
        revenue: reportRows.reduce((sum, row) => sum + numeric(row.amount), 0),
        commission: reportRows.reduce((sum, row) => sum + numeric(row.commission), 0),
        cashCollected: reportRows.reduce((sum, row) => sum + numeric(row.cash), 0),
        qrCollected: reportRows.reduce((sum, row) => sum + numeric(row.qr), 0),
        customers: uniqueCustomers,
      },
    },
  };
}

export async function getStaffLeaderboard(db, period = 'month') {
  const clause = STAFF_PERF_PERIODS[period] || STAFF_PERF_PERIODS.month;
  return db.all(`
    SELECT u.id,
           COALESCE(NULLIF(sp.display_name, ''), u.full_name) as name,
           sp.salon_role as role,
           COUNT(b.id)::int as "servicesCompleted",
           COUNT(DISTINCT b.customer_id)::int as "customersServed",
           COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN i.subtotal ELSE 0 END), 0) as revenue,
           COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN i.commission_amount ELSE 0 END), 0) as commission
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN salon_bill_items i ON i.staff_id = u.id AND i.item_type = 'service'
    LEFT JOIN salon_bills b ON b.id = i.bill_id AND b.status = 'paid' AND ${clause}
    WHERE u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
    GROUP BY u.id, sp.display_name, u.full_name, sp.salon_role
    ORDER BY revenue DESC, "servicesCompleted" DESC
  `);
}

function metricValue(row = {}) {
  return {
    servicesCompleted: Number(row.servicesCompleted || row.servicescompleted || 0),
    customersServed: Number(row.customersServed || row.customersserved || 0),
    invoiceCount: Number(row.invoiceCount || row.invoicecount || 0),
    revenue: numeric(row.revenue),
    commission: numeric(row.commission),
    cashCollected: numeric(row.cashCollected ?? row.cashcollected),
    qrCollected: numeric(row.qrCollected ?? row.qrcollected),
  };
}

async function getStaffMetric(db, staffId, period) {
  const clause = STAFF_PERF_PERIODS[period] || STAFF_PERF_PERIODS.month;
  const row = await db.get(`
    SELECT COUNT(i.id)::int as "servicesCompleted",
           COUNT(DISTINCT b.customer_id)::int as "customersServed",
           COUNT(DISTINCT b.id)::int as "invoiceCount",
           COALESCE(SUM(i.subtotal), 0) as revenue,
           COALESCE(SUM(i.commission_amount), 0) as commission,
           COALESCE(SUM(${ITEM_CASH_SQL}), 0) as "cashCollected",
           COALESCE(SUM(${ITEM_QR_SQL}), 0) as "qrCollected"
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service'
      AND i.staff_id = ?
      AND b.status = 'paid'
      AND ${clause}
  `, [staffId]);
  return metricValue(row);
}

async function getTopServicesForStaff(db, staffId) {
  const rows = await db.all(`
    SELECT i.name,
           COUNT(i.id)::int as count,
           COALESCE(SUM(i.subtotal), 0) as revenue
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service'
      AND i.staff_id = ?
      AND b.status = 'paid'
      AND ${STAFF_PERF_PERIODS.month}
    GROUP BY i.name
    ORDER BY revenue DESC, count DESC
    LIMIT 5
  `, [staffId]);
  return rows.map((row) => ({
    name: row.name,
    count: Number(row.count || 0),
    revenue: numeric(row.revenue),
  }));
}

async function getRecentServicesForStaff(db, staffId) {
  const rows = await db.all(`
    SELECT i.id as "itemId",
           b.bill_number as invoice,
           b.customer_name as "customerName",
           i.name as "serviceName",
           i.subtotal as amount,
           i.commission_amount as commission,
           ${BILL_DATE_EXPR_B} as date
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service'
      AND i.staff_id = ?
      AND b.status = 'paid'
    ORDER BY ${BILL_DATE_EXPR_B} DESC, i.id DESC
    LIMIT 6
  `, [staffId]);
  return rows.map((row) => ({
    ...row,
    itemId: row.itemId || row.itemid,
    amount: numeric(row.amount),
    commission: numeric(row.commission),
  }));
}

async function getMonthlyTrend(db) {
  const rows = await db.all(`
    SELECT day::date as date,
           COALESCE(SUM(i.subtotal), 0) as revenue,
           COUNT(i.id)::int as services
    FROM generate_series(
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date - INTERVAL '13 days',
      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date,
      INTERVAL '1 day'
    ) day
    LEFT JOIN salon_bills b
      ON ((COALESCE(b.transaction_time, b.created_at)) AT TIME ZONE 'Asia/Kathmandu')::date = day::date
      AND b.status = 'paid'
    LEFT JOIN salon_bill_items i
      ON i.bill_id = b.id
      AND i.item_type = 'service'
    GROUP BY day
    ORDER BY day ASC
  `);
  return rows.map((row) => ({
    date: row.date,
    revenue: numeric(row.revenue),
    services: Number(row.services || 0),
  }));
}

function buildInsights(details, totals) {
  const monthDetails = [...details].sort((a, b) => b.metrics.month.revenue - a.metrics.month.revenue);
  const serviceDetails = [...details].sort((a, b) => b.metrics.month.servicesCompleted - a.metrics.month.servicesCompleted);
  const commissionDetails = [...details].sort((a, b) => b.metrics.month.commission - a.metrics.month.commission);
  return [
    monthDetails[0] ? `${monthDetails[0].name} is leading monthly revenue with ${monthDetails[0].metrics.month.revenue.toFixed(2)}.` : null,
    serviceDetails[0] ? `${serviceDetails[0].name} completed the most services this month: ${serviceDetails[0].metrics.month.servicesCompleted}.` : null,
    commissionDetails[0] ? `${commissionDetails[0].name} has the highest commission this month: ${commissionDetails[0].metrics.month.commission.toFixed(2)}.` : null,
    totals.today.servicesCompleted > 0 ? `The team completed ${totals.today.servicesCompleted} services today.` : 'No completed services have been recorded today yet.',
  ].filter(Boolean);
}

export async function getAdminStaffAnalytics(db) {
  const today = await getStaffLeaderboard(db, 'today');
  const week = await getStaffLeaderboard(db, 'week');
  const month = await getStaffLeaderboard(db, 'month');
  const lifetime = await getStaffLeaderboard(db, 'lifetime');

  const byRevenue = [...month].sort((a, b) => b.revenue - a.revenue);
  const byCommission = [...month].sort((a, b) => b.commission - a.commission);
  const byServices = [...month].sort((a, b) => b.servicesCompleted - a.servicesCompleted);
  const byCustomers = [...month].sort((a, b) => b.customersServed - a.customersServed);
  const low = [...month].sort((a, b) => a.revenue - b.revenue);

  const staff = await db.all(`
    SELECT u.id,
           COALESCE(NULLIF(sp.display_name, ''), u.full_name) as name,
           u.username,
           u.is_active,
           sp.salon_role as role,
           COALESCE(sp.assigned_services, '') as "assignedServices",
           COALESCE(sp.commission_percentage, 0) as "commissionPercentage"
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
    ORDER BY u.full_name ASC
  `);

  const staffDetails = [];
  for (const member of staff) {
    const metrics = {
      today: await getStaffMetric(db, member.id, 'today'),
      week: await getStaffMetric(db, member.id, 'week'),
      month: await getStaffMetric(db, member.id, 'month'),
      lifetime: await getStaffMetric(db, member.id, 'lifetime'),
    };
    const activeDaysRow = await db.get(`
      SELECT COUNT(DISTINCT (${BILL_DATE_EXPR_B})::date)::int as "activeDays",
             MAX(${BILL_DATE_EXPR_B}) as "lastServiceAt"
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE i.item_type = 'service' AND i.staff_id = ? AND b.status = 'paid'
    `, [member.id]);
    const activeDays = Math.max(1, Number(activeDaysRow?.activeDays || activeDaysRow?.activedays || 0));
    const monthRevenueShare = Number(byRevenue.reduce((sum, row) => sum + numeric(row.revenue), 0) || 0);
    const serviceValue = metrics.month.servicesCompleted > 0 ? metrics.month.revenue / metrics.month.servicesCompleted : 0;
    staffDetails.push({
      id: member.id,
      name: member.name,
      username: member.username,
      role: member.role,
      assignedServices: member.assignedServices,
      commissionPercentage: numeric(member.commissionPercentage),
      metrics,
      topServices: await getTopServicesForStaff(db, member.id),
      recentServices: await getRecentServicesForStaff(db, member.id),
      averages: {
        serviceValue,
        servicesPerActiveDay: metrics.lifetime.servicesCompleted / activeDays,
        revenuePerActiveDay: metrics.lifetime.revenue / activeDays,
      },
      monthRevenueShare: monthRevenueShare > 0 ? Math.round((metrics.month.revenue / monthRevenueShare) * 100) : 0,
      lastServiceAt: activeDaysRow?.lastServiceAt || activeDaysRow?.lastserviceat || null,
      performanceScore: Math.round(
        metrics.month.revenue * 0.04 +
        metrics.month.servicesCompleted * 4 +
        metrics.month.customersServed * 3
      ),
    });
  }

  const totals = ['today', 'week', 'month', 'lifetime'].reduce((acc, period) => {
    acc[period] = staffDetails.reduce((sum, member) => ({
      servicesCompleted: sum.servicesCompleted + member.metrics[period].servicesCompleted,
      customersServed: sum.customersServed + member.metrics[period].customersServed,
      invoiceCount: sum.invoiceCount + member.metrics[period].invoiceCount,
      revenue: sum.revenue + member.metrics[period].revenue,
      commission: sum.commission + member.metrics[period].commission,
      cashCollected: sum.cashCollected + member.metrics[period].cashCollected,
      qrCollected: sum.qrCollected + member.metrics[period].qrCollected,
    }), { servicesCompleted: 0, customersServed: 0, invoiceCount: 0, revenue: 0, commission: 0, cashCollected: 0, qrCollected: 0 });
    return acc;
  }, {});

  return {
    today,
    week,
    month,
    lifetime,
    totals,
    staffDetails: staffDetails.sort((a, b) => b.metrics.month.revenue - a.metrics.month.revenue),
    trend: await getMonthlyTrend(db),
    insights: buildInsights(staffDetails, totals),
    highlights: {
      topRevenueGenerator: byRevenue[0] || null,
      topCommissionEarner: byCommission[0] || null,
      mostServicesCompleted: byServices[0] || null,
      mostCustomersServed: byCustomers[0] || null,
      bestBarber: byRevenue.find((row) => row.role === 'barber') || null,
      bestStylist: byRevenue.find((row) => row.role === 'stylist') || null,
      bestBeautician: byRevenue.find((row) => row.role === 'beautician') || null,
      lowestPerformanceStaff: low[0] || null,
    },
  };
}
