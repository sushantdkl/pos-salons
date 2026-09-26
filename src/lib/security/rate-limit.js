/**
 * Small fixed-window rate limiter for PUBLIC endpoints (booking requests, availability).
 *
 * In-memory per Node process. cPanel/Passenger normally runs a single app process for this
 * salon, which is what this is sized for; with several processes each keeps its own window,
 * so the effective limit is multiplied — still a real brake on abuse, not a hard quota.
 */

const buckets = new Map();
const MAX_KEYS = 5000;

export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Failed-attempt lockout (login). Only FAILURES count, so a salon with several staff logging
 * in from the same counter IP is never locked out by normal use.
 */
const failures = new Map();

export function loginLockout(key, { maxFailures = 8, windowMs = 10 * 60_000 } = {}) {
  const now = Date.now();
  const entry = failures.get(key);
  if (entry && entry.resetAt > now && entry.count >= maxFailures) {
    return { locked: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key, { windowMs = 10 * 60_000 } = {}) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    if (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value);
    failures.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key) {
  failures.delete(key);
}

/** Returns { allowed, retryAfterSeconds }. */
export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [storedKey, stored] of buckets) if (stored.resetAt <= now) buckets.delete(storedKey);
      if (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  return { allowed: true, retryAfterSeconds: 0 };
}
