/**
 * Server-side cache of Settings → Calendar (AD / BS). Report periods ("This Month",
 * "Last Month") are built synchronously in SQL helpers, so they read this cache; it is refreshed
 * on every authenticated request (at most every 15 s) and immediately when Settings are saved.
 * One process serves one salon database, so a module-level cache is safe.
 */
import { normalizeCalendarSystem } from './calendar.js';

const TTL_MS = 15_000;
let cached = 'AD';
let loadedAt = 0;
let pending = null;

export function getServerCalendarSystem() {
  return cached;
}

export function setServerCalendarSystem(value) {
  cached = normalizeCalendarSystem(value);
  loadedAt = Date.now();
}

export async function refreshServerCalendarSystem(db, { force = false } = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return cached;
  if (!pending) {
    pending = db.get("SELECT setting_value FROM system_settings WHERE setting_key = 'calendar_system'")
      .then((row) => { setServerCalendarSystem(row?.setting_value); return cached; })
      .catch(() => cached)
      .finally(() => { pending = null; });
  }
  return pending;
}
