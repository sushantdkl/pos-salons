'use client';

/**
 * MY APPOINTMENTS — a barber / stylist / beautician's own schedule. The API returns only
 * the signed-in staff member's appointments (without customer phone numbers) and only lets
 * them start and complete their own services.
 */

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { EmptyState, ErpButton, ErpPage, ErrorState, LoadingState, PageHeader, RefreshButton, StatusBadge } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const LABEL = { PENDING: ['Pending', 'cash'], CONFIRMED: ['Confirmed', 'online'], CHECKED_IN: ['Arrived', 'ledger'], IN_SERVICE: ['In service', 'hrm'], COMPLETED: ['Completed', 'inflow'], CANCELLED: ['Cancelled', 'neutral'], NO_SHOW: ['No show', 'outflow'] };

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}
function plus(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function dayLabel(iso) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

export default function MyAppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const start = today();
      setAppointments((await erpFetch(`/api/appointments?from=${start}&to=${plus(start, 6)}`)).appointments || []);
    } catch (loadError) { setError(loadError.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setBusy(id);
    try { await erpFetch(`/api/appointments/${id}`, { method: 'POST', body: { action } }); await load(); } catch (actionError) { setError(actionError.message); } finally { setBusy(null); }
  };

  const days = [...new Set(appointments.map((item) => item.date))];

  return (
    <ErpPage narrow>
      <PageHeader icon={CalendarClock} iconTone="outflow" title="My appointments" subtitle="Your bookings for the next 7 days." actions={<RefreshButton loading={loading} onClick={load} />} />
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {loading && !appointments.length ? <LoadingState /> : null}
      {!loading && !appointments.length ? <EmptyState icon={CalendarClock} title="No appointments this week" message="New bookings assigned to you appear here." /> : null}
      <div className="space-y-4">
        {days.map((day) => (
          <section key={day}>
            <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.05em] text-stone-700">{day === today() ? 'Today' : dayLabel(day)}</h2>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {appointments.filter((item) => item.date === day).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <span className="w-24 shrink-0 text-sm font-bold tabular-nums text-stone-900">{item.startTime}–{item.endTime}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-stone-900">{item.customerName}</p>
                    <p className="truncate text-xs text-stone-500">{item.services.map((service) => service.name).join(', ') || item.requestedServiceText}</p>
                    {item.notes ? <p className="truncate text-xs italic text-stone-400">{item.notes}</p> : null}
                  </div>
                  <StatusBadge status={item.status} label={LABEL[item.status][0]} tone={LABEL[item.status][1]} />
                  {item.status === 'CHECKED_IN' ? <ErpButton variant="primary" disabled={busy === item.id} onClick={() => act(item.id, 'start')}>Start</ErpButton> : null}
                  {item.status === 'IN_SERVICE' ? <ErpButton variant="primary" disabled={busy === item.id} onClick={() => act(item.id, 'complete')}>Done</ErpButton> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ErpPage>
  );
}
