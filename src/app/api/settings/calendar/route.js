import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth } from '@/lib/salon-schema';
import { normalizeCalendarSystem } from '@/lib/dates/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The salon's display calendar (AD / BS) for every signed-in role — nothing else. */
export async function GET(request) {
  try {
    const db = Database.getInstance();
    await requireAuth(request, db);
    const row = await db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'calendar_system'");
    return NextResponse.json({ calendarSystem: normalizeCalendarSystem(row?.setting_value) });
  } catch (error) {
    const status = error.status || 500;
    return NextResponse.json({ error: status < 500 ? error.message : 'Unable to load the calendar' }, { status });
  }
}
