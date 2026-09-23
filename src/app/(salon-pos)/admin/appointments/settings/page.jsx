'use client';

/**
 * APPOINTMENT SETTINGS (admin) — salon booking rules, each staff member's weekly hours and
 * time off. Availability, conflict checks and the website booking form all read these.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarCog, Trash2 } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, PageHeader, ReportSection, SectionHeading,
} from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FIELD = 'h-10 rounded-lg border border-stone-300 bg-white px-2 text-sm';

function BookingSettings({ settings, onSaved }) {
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setForm(settings), [settings]);
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setMessage(''); };
  const save = async () => {
    setError('');
    try {
      const payload = await erpFetch('/api/appointments/schedule', {
        method: 'PUT',
        body: {
          type: 'settings', openTime: form.openTime, closeTime: form.closeTime, slotMinutes: Number(form.slotMinutes),
          onlineBookingEnabled: form.onlineBookingEnabled, instantConfirm: form.instantConfirm, maxDaysAhead: Number(form.maxDaysAhead),
        },
      });
      onSaved(payload);
      setMessage('Saved.');
    } catch (saveError) { setError(saveError.message); }
  };
  return (
    <ReportSection title="Salon hours & online booking" note="Default hours apply to any staff member without their own weekly hours.">
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-bold text-stone-500">Opens<input type="time" className={`${FIELD} mt-1 block w-full`} value={form.openTime} onChange={(event) => set('openTime', event.target.value)} /></label>
        <label className="text-xs font-bold text-stone-500">Closes<input type="time" className={`${FIELD} mt-1 block w-full`} value={form.closeTime} onChange={(event) => set('closeTime', event.target.value)} /></label>
        <label className="text-xs font-bold text-stone-500">Slot length
          <select className={`${FIELD} mt-1 block w-full`} value={form.slotMinutes} onChange={(event) => set('slotMinutes', event.target.value)}>
            {[5, 10, 15, 20, 30, 45, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" checked={form.onlineBookingEnabled} onChange={(event) => set('onlineBookingEnabled', event.target.checked)} /> Accept booking requests on the website</label>
        <label className="text-xs font-bold text-stone-500">Book up to (days ahead)<input type="number" min="1" max="180" className={`${FIELD} mt-1 block w-full`} value={form.maxDaysAhead} onChange={(event) => set('maxDaysAhead', event.target.value)} /></label>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" className="mt-1" checked={form.instantConfirm} onChange={(event) => set('instantConfirm', event.target.checked)} />
          <span>Instant confirmation<span className="block text-xs text-stone-500">Only when the visitor picks a specific stylist and the slot is free (checked under a lock). Otherwise requests stay Pending until you confirm.</span></span>
        </label>
      </div>
      <div className="flex items-center gap-3 border-t border-stone-100 px-4 py-3">
        <ErpButton variant="primary" onClick={save}>Save</ErpButton>
        {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
        {error ? <span role="alert" className="text-sm text-rose-700">{error}</span> : null}
      </div>
    </ReportSection>
  );
}

function StaffWeek({ member, onSaved }) {
  const [week, setWeek] = useState(member.week);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setWeek(member.week), [member]);
  const update = (weekday, patch) => { setWeek((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day))); setMessage(''); };
  const save = async () => {
    setError('');
    try {
      onSaved(await erpFetch('/api/appointments/schedule', { method: 'PUT', body: { type: 'week', staffId: member.id, week } }));
      setMessage('Saved.');
    } catch (saveError) { setError(saveError.message); }
  };
  return (
    <ReportSection title={`${member.name} · ${member.role}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <tbody className="divide-y divide-stone-100">
            {week.map((day) => (
              <tr key={day.weekday}>
                <td className="w-28 px-4 py-2 font-semibold text-stone-700">{DAYS[day.weekday]}</td>
                <td className="px-2 py-2"><label className="flex items-center gap-1.5 text-xs text-stone-600"><input type="checkbox" checked={day.isOff} onChange={(event) => update(day.weekday, { isOff: event.target.checked })} /> Day off</label></td>
                <td className="px-2 py-2"><input type="time" aria-label={`${DAYS[day.weekday]} start`} className={FIELD} disabled={day.isOff} value={day.start || ''} onChange={(event) => update(day.weekday, { start: event.target.value })} /></td>
                <td className="px-2 py-2"><input type="time" aria-label={`${DAYS[day.weekday]} end`} className={FIELD} disabled={day.isOff} value={day.end || ''} onChange={(event) => update(day.weekday, { end: event.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-t border-stone-100 px-4 py-3">
        <ErpButton onClick={save}>Save hours</ErpButton>
        {!member.week.some((day) => day.custom) ? <span className="text-xs text-stone-500">Using salon default hours</span> : null}
        {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
        {error ? <span role="alert" className="text-sm text-rose-700">{error}</span> : null}
      </div>
    </ReportSection>
  );
}

export default function AppointmentSettingsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [timeOff, setTimeOff] = useState({ staffId: '', startsAt: '', endsAt: '', reason: '' });
  const [timeOffError, setTimeOffError] = useState('');

  const load = () => erpFetch('/api/appointments/schedule').then(setData).catch((loadError) => setError(loadError.message));
  useEffect(() => { load(); }, []);

  const addTimeOff = async () => {
    setTimeOffError('');
    try {
      // datetime-local values are Nepal wall-clock times; send them with the Nepal offset.
      const payload = await erpFetch('/api/appointments/schedule', {
        method: 'PUT',
        body: { type: 'time_off', staffId: Number(timeOff.staffId), startsAt: `${timeOff.startsAt}:00+05:45`, endsAt: `${timeOff.endsAt}:00+05:45`, reason: timeOff.reason },
      });
      setData(payload);
      setTimeOff({ staffId: '', startsAt: '', endsAt: '', reason: '' });
    } catch (saveError) { setTimeOffError(saveError.message); }
  };

  const nepal = (value) => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <ErpPage narrow>
      <PageHeader
        icon={CalendarCog}
        iconTone="outflow"
        title="Hours & booking"
        subtitle="When each stylist works, when they are away, and how the website takes bookings."
        actions={<Link href="/admin/appointments" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><ArrowLeft className="h-4 w-4" /> Appointments</Link>}
      />
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!data && !error ? <LoadingState /> : null}
      {data ? (
        <div className="space-y-4">
          <BookingSettings settings={data.settings} onSaved={setData} />

          <SectionHeading title="Weekly hours" note="Appointments outside these hours need an admin override." />
          {data.staff.length ? data.staff.map((member) => <StaffWeek key={member.id} member={member} onSaved={setData} />)
            : <AlertBanner tone="online">No barbers, stylists or beauticians yet. Add them under Staff.</AlertBanner>}

          <SectionHeading title="Time off & blocked time" note="Leave, training or any time a stylist cannot take bookings." />
          <ReportSection>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-bold text-stone-500">Staff
                <select className={`${FIELD} mt-1 block w-full`} value={timeOff.staffId} onChange={(event) => setTimeOff({ ...timeOff, staffId: event.target.value })}>
                  <option value="">Choose…</option>
                  {data.staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-stone-500">From<input type="datetime-local" className={`${FIELD} mt-1 block w-full`} value={timeOff.startsAt} onChange={(event) => setTimeOff({ ...timeOff, startsAt: event.target.value })} /></label>
              <label className="text-xs font-bold text-stone-500">To<input type="datetime-local" className={`${FIELD} mt-1 block w-full`} value={timeOff.endsAt} onChange={(event) => setTimeOff({ ...timeOff, endsAt: event.target.value })} /></label>
              <label className="text-xs font-bold text-stone-500">Reason<input className={`${FIELD} mt-1 block w-full`} value={timeOff.reason} onChange={(event) => setTimeOff({ ...timeOff, reason: event.target.value })} /></label>
            </div>
            <div className="flex items-center gap-3 border-t border-stone-100 px-4 py-3">
              <ErpButton variant="primary" disabled={!timeOff.staffId || !timeOff.startsAt || !timeOff.endsAt} onClick={addTimeOff}>Add time off</ErpButton>
              {timeOffError ? <span role="alert" className="text-sm text-rose-700">{timeOffError}</span> : null}
            </div>
          </ReportSection>
          <FinancialTable
            caption="Upcoming time off"
            rows={data.timeOff}
            empty="No upcoming time off."
            columns={[
              { key: 'staff', label: 'Staff', render: (row) => data.staff.find((member) => String(member.id) === String(row.staffId))?.name || '—' },
              { key: 'from', label: 'From', render: (row) => nepal(row.startsAt) },
              { key: 'to', label: 'To', render: (row) => nepal(row.endsAt) },
              { key: 'reason', label: 'Reason', render: (row) => row.reason || '—' },
              {
                key: 'remove', label: '', render: (row) => (
                  <button type="button" aria-label="Remove time off" className="text-rose-600 hover:text-rose-800" onClick={async () => setData(await erpFetch(`/api/appointments/schedule?timeOffId=${row.id}`, { method: 'DELETE' }))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                ),
              },
            ]}
          />
        </div>
      ) : null}
    </ErpPage>
  );
}
