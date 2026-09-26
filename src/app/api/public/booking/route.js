import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema } from '@/lib/salon-schema';
import { createAppointment, getAvailability, getSchedulingSettings } from '@/lib/appointments/service';
import { normalizePhone } from '@/lib/validation/phone';
import { clientIp, rateLimit } from '@/lib/security/rate-limit';
import { appointmentError } from '@/app/api/appointments/_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_OPEN_REQUESTS_PER_PHONE = 3;

function tooMany(retryAfterSeconds) {
  return NextResponse.json(
    { error: 'Too many requests. Please wait a moment and try again, or contact the salon on WhatsApp.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/**
 * PUBLIC booking options. Only what a visitor needs: bookable services and staff (names only)
 * and, for a chosen date, free start times. No customer data is ever returned.
 */
export async function GET(request) {
  try {
    const limited = rateLimit(`booking-read:${clientIp(request)}`, { limit: 120, windowMs: 60_000 });
    if (!limited.allowed) return tooMany(limited.retryAfterSeconds);
    const db = Database.getInstance();
    await ensureSalonSchema();
    const settings = await getSchedulingSettings(db);
    if (!settings.onlineBookingEnabled) return NextResponse.json({ enabled: false });

    const params = new URL(request.url).searchParams;
    const [services, staff] = await Promise.all([
      db.all(`
        SELECT id, name, category, price, duration_minutes
        FROM salon_services
        WHERE is_active = TRUE AND COALESCE(show_on_website, TRUE) = TRUE
        ORDER BY category, name
      `),
      db.all(`
        SELECT u.id, COALESCE(NULLIF(sp.display_name, ''), u.full_name) AS name,
               COALESCE(NULLIF(sp.website_title, ''), sp.salon_role) AS role
        FROM users u JOIN staff_profiles sp ON sp.user_id = u.id
        WHERE u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
          AND COALESCE(sp.show_on_website, TRUE) = TRUE
        ORDER BY name
      `),
    ]);

    let availability = null;
    const date = params.get('date');
    if (date) {
      const staffId = Number(params.get('staffId') || 0) || null;
      if (staffId && !staff.some((member) => String(member.id) === String(staffId))) {
        return NextResponse.json({ error: 'That staff member does not take online bookings' }, { status: 400 });
      }
      const full = await getAvailability(db, {
        date,
        serviceIds: String(params.get('services') || '').split(',').filter(Boolean),
        staffId,
        publicMode: true,
      });
      const visible = new Set(staff.map((member) => String(member.id)));
      const members = full.staff.filter((member) => visible.has(String(member.id)));
      availability = {
        date: full.date,
        durationMinutes: full.durationMinutes,
        staff: members.map((member) => ({ id: member.id, name: member.name, slots: member.slots })),
        anyStaff: [...new Set(members.flatMap((member) => member.slots))].sort(),
      };
    }

    return NextResponse.json({
      enabled: true,
      instantConfirm: settings.instantConfirm,
      openTime: settings.openTime,
      closeTime: settings.closeTime,
      maxDaysAhead: settings.maxDaysAhead,
      services: services.map((service) => ({
        id: service.id, name: service.name, category: service.category,
        price: Number(service.price || 0), duration: Number(service.duration_minutes || 30),
      })),
      staff: staff.map((member) => ({ id: member.id, name: member.name, role: member.role })),
      availability,
    });
  } catch (error) {
    return appointmentError(error, 'Online booking is unavailable right now.');
  }
}

/** PUBLIC booking request -> a PENDING appointment the salon confirms. */
export async function POST(request) {
  try {
    const ip = clientIp(request);
    const limited = rateLimit(`booking-write:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
    if (!limited.allowed) return tooMany(limited.retryAfterSeconds);

    const db = Database.getInstance();
    await ensureSalonSchema();
    const settings = await getSchedulingSettings(db);
    if (!settings.onlineBookingEnabled) {
      return NextResponse.json({ error: 'Online booking is currently turned off. Please contact the salon.' }, { status: 403 });
    }

    const data = await request.json();
    // Honeypot: a hidden field real visitors never fill.
    if (String(data.website || '').trim()) return NextResponse.json({ error: 'Request rejected' }, { status: 400 });

    const phone = normalizePhone(String(data.customerPhone || ''));
    if (phone) {
      const open = await db.get(`
        SELECT COUNT(*)::int AS n FROM appointments
        WHERE customer_phone = ? AND source = 'WEBSITE' AND status IN ('PENDING', 'CONFIRMED')
          AND appointment_date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')::date
      `, [phone]);
      if (Number(open?.n || 0) >= MAX_OPEN_REQUESTS_PER_PHONE) {
        return NextResponse.json({ error: 'You already have upcoming booking requests. The salon will contact you to confirm them.' }, { status: 409 });
      }
    }

    // Staff chosen on the website must be one that is shown there.
    const staffId = Number(data.staffId || 0) || null;
    if (staffId) {
      const visible = await db.get(`
        SELECT 1 FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
        WHERE sp.user_id = ? AND u.is_active = TRUE AND COALESCE(sp.show_on_website, TRUE) = TRUE
      `, [staffId]);
      if (!visible) return NextResponse.json({ error: 'That staff member does not take online bookings' }, { status: 400 });
    }

    const result = await createAppointment(db, null, {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      date: data.date,
      startTime: data.startTime,
      services: Array.isArray(data.serviceIds) ? data.serviceIds.slice(0, 5) : [],
      requestedServiceText: data.requestedServiceText,
      staffId,
      requestedStaffText: data.requestedStaffText,
      notes: String(data.notes || '').slice(0, 500),
      idempotencyKey: data.idempotencyKey,
    }, { publicRequest: true });

    const appointment = result.appointment;
    return NextResponse.json({
      booking: {
        number: appointment.number,
        status: appointment.status,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        services: appointment.services.map((service) => service.name),
        staffName: appointment.staffName,
      },
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return appointmentError(error, 'Your booking could not be sent. Please try again or contact the salon on WhatsApp.');
  }
}
