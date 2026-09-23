/**
 * "Right now" front-desk widgets shared by the admin and cashier dashboards: the live token
 * queue of the current Business Day and the rest of today's appointments. No money here.
 */

export async function getFrontDeskNow(db, businessDayId) {
  const [queue, upcoming] = await Promise.all([
    businessDayId ? db.all(`
      SELECT wt.id, wt.token_number, wt.customer_name, wt.created_at, s.name AS service_name,
             COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS staff_name
      FROM walk_in_tokens wt
      LEFT JOIN salon_services s ON s.id = wt.service_id
      LEFT JOIN users u ON u.id = wt.assigned_staff_id
      LEFT JOIN staff_profiles sp ON sp.user_id = wt.assigned_staff_id
      WHERE wt.business_day_id = ? AND wt.status = 'WAITING'
      ORDER BY wt.created_at ASC, wt.id ASC
      LIMIT 12
    `, [businessDayId]) : Promise.resolve([]),
    db.all(`
      SELECT a.id, a.appointment_number, a.customer_name, a.start_time::text AS start_time, a.status, a.source,
             COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS staff_name,
             (SELECT string_agg(aps.service_name, ', ' ORDER BY aps.sort_order) FROM appointment_services aps WHERE aps.appointment_id = a.id) AS services
      FROM appointments a
      LEFT JOIN users u ON u.id = a.staff_id
      LEFT JOIN staff_profiles sp ON sp.user_id = a.staff_id
      WHERE a.appointment_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date
        AND a.status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE')
      ORDER BY a.start_time
      LIMIT 12
    `),
  ]);
  const pendingWebsite = await db.get(`
    SELECT COUNT(*)::int AS n FROM appointments
    WHERE status = 'PENDING' AND source = 'WEBSITE'
      AND appointment_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date
  `);

  return {
    queue: queue.map((token) => ({
      id: token.id,
      tokenNumber: token.token_number,
      customerName: token.customer_name || 'Walk-in',
      serviceName: token.service_name || null,
      staffName: token.staff_name || null,
      createdAt: token.created_at,
    })),
    upcomingAppointments: upcoming.map((row) => ({
      id: row.id,
      number: row.appointment_number,
      customerName: row.customer_name,
      startTime: String(row.start_time).slice(0, 5),
      status: row.status,
      source: row.source,
      staffName: row.staff_name || null,
      services: row.services || '',
    })),
    pendingWebsiteRequests: Number(pendingWebsite?.n || 0),
  };
}
