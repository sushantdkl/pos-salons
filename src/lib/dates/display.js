'use client';

/**
 * Calendar-aware display dates for every POS screen. Settings → Calendar picks AD or BS; this
 * module keeps that choice (cached in localStorage, refreshed from the server once per page load)
 * and formats dates with it. Stored and API dates always stay canonical AD — only display changes.
 *
 *   const calendar = useCalendarSystem();      // re-renders the component when the setting changes
 *   fmtDate('2026-09-24')                      // "24 Sept 2026"  |  "8 Ashwin 2083"
 *   fmtDateTime(isoTimestamp)                  // "24 Sept 2026, 11:30 pm"  |  "8 Ashwin 2083, 11:30 pm"
 */

import { useEffect, useSyncExternalStore } from 'react';
import { BS_MONTH_NAMES, NEPAL_TIME_ZONE, adToBsParts, isCanonicalAdDate, nepalDateString, normalizeCalendarSystem } from './calendar.js';

const STORAGE_KEY = 'salon_calendar_system';
const listeners = new Set();
let current = 'AD';
let request = null;

if (typeof window !== 'undefined') {
  try { current = normalizeCalendarSystem(window.localStorage.getItem(STORAGE_KEY)); } catch { /* storage unavailable */ }
}

export function getCalendarSystem() {
  return current;
}

export function setCalendarSystem(value) {
  const next = normalizeCalendarSystem(value);
  try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** Fetch the salon's calendar once per page load (any signed-in role may read it). */
export function loadCalendarSystem({ force = false } = {}) {
  if (typeof window === 'undefined') return Promise.resolve(current);
  if (request && !force) return request;
  const token = window.localStorage.getItem('pos_token');
  if (!token) return Promise.resolve(current);
  request = fetch('/api/settings/calendar', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => { if (body?.calendarSystem) setCalendarSystem(body.calendarSystem); return current; })
    .catch(() => current);
  return request;
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The salon's display calendar ('AD' | 'BS'); the component re-renders when it changes. */
export function useCalendarSystem() {
  const value = useSyncExternalStore(subscribe, () => current, () => 'AD');
  useEffect(() => { loadCalendarSystem(); }, []);
  return value;
}

/* ------------------------------------------------------------------ formatting */

function toAdDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (isCanonicalAdDate(value)) return value;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) || value instanceof Date || typeof value === 'number' || !Number.isNaN(Date.parse(text))) {
    try { return nepalDateString(value); } catch { return null; }
  }
  return null;
}

/**
 * A date (AD 'YYYY-MM-DD' or any timestamp, read in Nepal time) in the salon's calendar.
 * Options: year (default true), weekday ('short' | 'long'), month ('short' | 'long').
 */
export function fmtDate(value, { system = current, year = true, weekday, month = 'short' } = {}) {
  const ad = toAdDate(value);
  if (!ad) return '—';
  const [y, m, d] = ad.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = weekday ? `${utc.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday })}, ` : '';
  if (normalizeCalendarSystem(system) === 'BS') {
    try {
      const bs = adToBsParts(ad);
      return `${day}${bs.day} ${BS_MONTH_NAMES[bs.month - 1]}${year ? ` ${bs.year}` : ''}`;
    } catch { /* outside the BS table: fall back to AD */ }
  }
  return `${day}${utc.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month, ...(year ? { year: 'numeric' } : {}) })}`;
}

/** Clock time in Nepal, e.g. "11:30 pm". */
export function fmtTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { timeZone: NEPAL_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Date and time of a timestamp in the salon's calendar. */
export function fmtDateTime(value, { system = current, year = true } = {}) {
  if (!value) return '—';
  const date = fmtDate(value, { system, year });
  return date === '—' ? '—' : `${date}, ${fmtTime(value)}`;
}

/** Day of month only, for compact chart axes. */
export function fmtDayNumber(value, { system = current } = {}) {
  const ad = toAdDate(value);
  if (!ad) return '';
  if (normalizeCalendarSystem(system) === 'BS') {
    try { return String(adToBsParts(ad).day).padStart(2, '0'); } catch { /* fall back */ }
  }
  return ad.slice(8, 10);
}

/** This month as 'YYYY-MM' in the salon's calendar (BS years are 2070+). */
export function currentMonth({ system = current } = {}) {
  const today = nepalDateString();
  if (normalizeCalendarSystem(system) === 'BS') {
    const bs = adToBsParts(today);
    return `${bs.year}-${String(bs.month).padStart(2, '0')}`;
  }
  return today.slice(0, 7);
}

/** A 'YYYY-MM' month label: "Ashwin 2083" for BS months, "Sept 2026" for AD months. */
export function fmtMonth(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return value || '—';
  const [year, month] = [Number(match[1]), Number(match[2])];
  if (year >= 2070) return `${BS_MONTH_NAMES[month - 1] || month} ${year}`;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' });
}
