'use client';
import { useEffect, useState } from 'react';
import { adToBsIso, bsToAdIso, isCanonicalAdDate, isValidBsDate, normalizeCalendarSystem } from '@/lib/dates/calendar';

export function CalendarDateInput({ value, onChange, calendarSystem='AD', min, max, className='', ...props }) {
  const system=normalizeCalendarSystem(calendarSystem); const [display,setDisplay]=useState(''); const [error,setError]=useState('');
  useEffect(()=>{try{setDisplay(value&&system==='BS'?adToBsIso(value):value||'');setError('');}catch{setDisplay(value||'');}},[value,system]);
  if(system==='AD') return <input {...props} type="date" value={value||''} min={min} max={max} onChange={event=>onChange(event.target.value)} className={className}/>;
  const commit=(raw)=>{setDisplay(raw);if(!isValidBsDate(raw)){setError(raw?'Enter a valid BS date (YYYY-MM-DD)':'');return;}try{const ad=bsToAdIso(raw);if((min&&ad<min)||(max&&ad>max)){setError('Date is outside the allowed range');return;}if(!isCanonicalAdDate(ad))throw new Error();setError('');onChange(ad);}catch{setError('Enter a valid BS date (YYYY-MM-DD)');}};
  return <span className="block"><input {...props} type="text" inputMode="numeric" placeholder="2083-06-04" value={display} onChange={event=>commit(event.target.value)} className={className} aria-invalid={Boolean(error)}/>{error?<span className="mt-1 block text-xs text-red-700">{error}</span>:null}</span>;
}
