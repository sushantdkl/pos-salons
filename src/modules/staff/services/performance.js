import { BILL_DATE_EXPR_B, STAFF_PERF_PERIODS, periodDateFilter } from '@/lib/db/postgres-dates';

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
      SELECT COUNT(i.id)::int as servicesCompleted,
             COUNT(DISTINCT b.customer_id)::int as customersServed,
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
    SELECT b.customer_name as customerName,
           i.name as serviceName,
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
           b.customer_name as customerName,
           i.name as serviceName,
           i.subtotal as amount,
           i.commission_amount as commission,
           b.payment_status as paymentStatus
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
      })),
      totals: {
        services: reportRows.length,
        revenue: reportRows.reduce((sum, row) => sum + numeric(row.amount), 0),
        commission: reportRows.reduce((sum, row) => sum + numeric(row.commission), 0),
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
           COUNT(b.id)::int as servicesCompleted,
           COUNT(DISTINCT b.customer_id)::int as customersServed,
           COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN i.subtotal ELSE 0 END), 0) as revenue,
           COALESCE(SUM(CASE WHEN b.id IS NOT NULL THEN i.commission_amount ELSE 0 END), 0) as commission
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN salon_bill_items i ON i.staff_id = u.id AND i.item_type = 'service'
    LEFT JOIN salon_bills b ON b.id = i.bill_id AND b.status = 'paid' AND ${clause}
    WHERE u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
    GROUP BY u.id, sp.display_name, u.full_name, sp.salon_role
    ORDER BY revenue DESC, servicesCompleted DESC
  `);
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

  return {
    today,
    week,
    month,
    lifetime,
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
