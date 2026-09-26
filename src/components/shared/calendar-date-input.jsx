'use client';
import { useEffect, useState } from 'react';
import { BS_MONTH_NAMES as BS_MONTHS, adToBsIso, bsToAdIso, isCanonicalAdDate, isValidBsDate, normalizeCalendarSystem } from '@/lib/dates/calendar';
import { getCalendarSystem } from '@/lib/dates/display';

/**
 * Date field in the salon's calendar. The value in and out is always canonical AD (YYYY-MM-DD);
 * with BS selected the person types / sees the BS date. onChange receives the AD string.
 */
export function CalendarDateInput({ value, onChange, calendarSystem = getCalendarSystem(), min, max, className = '', ...props }) {
  const system = normalizeCalendarSystem(calendarSystem);
  const [display, setDisplay] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    try { setDisplay(value && system === 'BS' ? adToBsIso(value) : value || ''); setError(''); } catch { setDisplay(value || ''); }
  }, [value, system]);
  if (system === 'AD') return <input {...props} type="date" value={value || ''} min={min} max={max} onChange={(event) => onChange(event.target.value)} className={className} />;
  const commit = (raw) => {
    setDisplay(raw);
    if (!raw) { setError(''); onChange(''); return; }
    if (!isValidBsDate(raw)) { setError('Enter a valid BS date (YYYY-MM-DD)'); return; }
    try {
      const ad = bsToAdIso(raw);
      if ((min && ad < min) || (max && ad > max)) { setError('Date is outside the allowed range'); return; }
      if (!isCanonicalAdDate(ad)) throw new Error('bad date');
      setError('');
      onChange(ad);
    } catch { setError('Enter a valid BS date (YYYY-MM-DD)'); }
  };
  return (
    <span className="block">
      <input {...props} type="text" inputMode="numeric" placeholder="2083-06-08 BS" value={display} onChange={(event) => commit(event.target.value)} className={className} aria-invalid={Boolean(error)} />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

/**
 * Drop-in replacement for <input type="date">: same props, and onChange still receives an event
 * whose target.value is the AD date — but it shows and accepts BS when Settings → Calendar is BS.
 */
export function DateInput({ value, onChange, ...props }) {
  return <CalendarDateInput {...props} value={value} onChange={(ad) => onChange?.({ target: { value: ad }, currentTarget: { value: ad } })} />;
}

/**
 * Month field ('YYYY-MM') in the salon's calendar: the native month picker for AD, BS month +
 * year selects for BS. onChange receives an event whose target.value is the month string.
 */
export function MonthInput({ value, onChange, className = '', ...props }) {
  const system = normalizeCalendarSystem(getCalendarSystem());
  const emit = (next) => onChange?.({ target: { value: next }, currentTarget: { value: next } });
  if (system === 'AD') return <input {...props} type="month" value={value || ''} onChange={(event) => emit(event.target.value)} className={className} />;
  const now = adToBsIso(new Date(Date.now() + 5.75 * 3600e3).toISOString().slice(0, 10)).slice(0, 7);
  const current = /^\d{4}-\d{2}$/.test(String(value || '')) && Number(String(value).slice(0, 4)) >= 2070 ? value : '';
  const [year, month] = (current || now).split('-');
  const years = Array.from({ length: 6 }, (_, index) => String(Number(now.slice(0, 4)) - 4 + index));
  return (
    <span className="grid grid-cols-[1fr_auto] gap-2">
      <select aria-label="BS month" value={current ? month : ''} onChange={(event) => emit(event.target.value ? `${year}-${event.target.value}` : '')} className={className}>
        <option value="">Month…</option>
        {BS_MONTHS.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}
      </select>
      <select aria-label="BS year" value={year} onChange={(event) => emit(`${event.target.value}-${current ? month : now.slice(5, 7)}`)} className={className}>
        {years.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </span>
  );
}
