const PERIODS = {
  today: "DATE(b.created_at) = DATE('now')",
  week: "DATE(b.created_at) >= DATE('now', '-6 days')",
  month: "DATE(b.created_at) >= DATE('now', '-29 days')",
  lifetime: '1=1',
};

function emptyMetric() {
  return {
    servicesCompleted: 0,
    customersServed: 0,
    revenue: 0,
    commission: 0,
  };
}

export function getStaffPerformance(db, staffId) {
  const metrics = Object.fromEntries(
    Object.entries(PERIODS).map(([period, clause]) => {
      const row = db.prepare(`
        SELECT COUNT(i.id) as servicesCompleted,
               COUNT(DISTINCT b.customer_id) as customersServed,
               COALESCE(SUM(i.subtotal), 0) as revenue,
               COALESCE(SUM(i.commission_amount), 0) as commission
        FROM salon_bill_items i
        JOIN salon_bills b ON b.id = i.bill_id
        WHERE i.item_type = 'service'
          AND i.staff_id = ?
          AND b.status = 'paid'
          AND ${clause}
      `).get(staffId);

      return [period, { ...emptyMetric(), ...row }];
    })
  );

  const recentServices = db.prepare(`
    SELECT b.customer_name as customerName,
           i.name as serviceName,
           b.bill_number as invoice,
           b.created_at as date,
           i.subtotal as revenue,
           i.commission_amount as commission
    FROM salon_bill_items i
    JOIN salon_bills b ON b.id = i.bill_id
    WHERE i.item_type = 'service'
      AND i.staff_id = ?
      AND b.status = 'paid'
    ORDER BY b.created_at DESC
    LIMIT 12
  `).all(staffId);

  const daysActive = Math.max(
    1,
    db.prepare(`
      SELECT COUNT(DISTINCT DATE(b.created_at)) as count
      FROM salon_bill_items i
      JOIN salon_bills b ON b.id = i.bill_id
      WHERE i.item_type = 'service' AND i.staff_id = ? AND b.status = 'paid'
    `).get(staffId).count || 1
  );

  return {
    metrics,
    recentServices,
    summary: {
      averageServicesPerDay: metrics.lifetime.servicesCompleted / daysActive,
      averageRevenuePerDay: metrics.lifetime.revenue / daysActive,
    },
  };
}

export function getStaffLeaderboard(db, period = 'month') {
  const clause = PERIODS[period] || PERIODS.month;
  return db.prepare(`
    SELECT u.id,
           COALESCE(NULLIF(sp.display_name, ''), u.full_name) as name,
           sp.salon_role as role,
           COUNT(i.id) as servicesCompleted,
           COUNT(DISTINCT b.customer_id) as customersServed,
           COALESCE(SUM(i.subtotal), 0) as revenue,
           COALESCE(SUM(i.commission_amount), 0) as commission
    FROM users u
    JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN salon_bill_items i ON i.staff_id = u.id AND i.item_type = 'service'
    LEFT JOIN salon_bills b ON b.id = i.bill_id AND b.status = 'paid' AND ${clause}
    WHERE u.is_active = 1 AND sp.salon_role IN ('barber', 'stylist', 'beautician')
    GROUP BY u.id
    ORDER BY revenue DESC, servicesCompleted DESC
  `).all();
}

export function getAdminStaffAnalytics(db) {
  const today = getStaffLeaderboard(db, 'today');
  const week = getStaffLeaderboard(db, 'week');
  const month = getStaffLeaderboard(db, 'month');
  const lifetime = getStaffLeaderboard(db, 'lifetime');

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
