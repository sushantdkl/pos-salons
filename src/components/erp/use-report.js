'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

function authHeaders() {
  let token = '';
  try { token = localStorage.getItem('pos_token') || ''; } catch { /* storage blocked */ }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Authenticated JSON request; throws with the server's error message on failure. */
export async function erpFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders(), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let json = {};
  try { json = await response.json(); } catch { /* empty body */ }
  if (!response.ok) {
    const error = new Error(json.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = json.code;
    error.data = json;
    throw error;
  }
  return json;
}

/**
 * Period state shared by every report page: a selected period plus a custom range that is
 * only APPLIED (and fetched) when the user confirms it.
 */
export function usePeriod(initial = 'today') {
  const [period, setPeriodState] = useState(initial);
  const [draft, setDraft] = useState({ start: '', end: '' });
  const [applied, setApplied] = useState({ start: '', end: '' });

  const setPeriod = useCallback((value) => {
    setPeriodState(value);
    if (value !== 'custom') setApplied({ start: '', end: '' });
  }, []);
  const setRange = useCallback((start, end) => setDraft({ start, end }), []);
  const applyRange = useCallback(() => {
    if (draft.start && draft.end && draft.start <= draft.end) setApplied(draft);
  }, [draft]);

  const ready = period !== 'custom' || Boolean(applied.start && applied.end);
  const query = new URLSearchParams({ period });
  if (period === 'custom' && applied.start && applied.end) {
    query.set('startDate', applied.start);
    query.set('endDate', applied.end);
  }

  return {
    period, setPeriod, draft, setRange, applyRange, ready, query: query.toString(),
    filterProps: {
      value: period,
      onChange: setPeriod,
      startDate: draft.start,
      endDate: draft.end,
      onRangeChange: setRange,
      onApplyRange: applyRange,
    },
  };
}

/** Load a report whenever its URL changes; stale responses are dropped. */
export function useReport(url, { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(enabled && url));
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !url) return;
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setError('');
    try {
      const json = await erpFetch(url);
      if (requestRef.current === request) setData(json);
    } catch (loadError) {
      if (requestRef.current === request) setError(loadError.message || 'Unable to load.');
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, [url, enabled]);

  useEffect(() => { load(); }, [load]);

  return { data, error, loading, reload: load, setData };
}
