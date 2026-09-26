/**
 * WhatsApp click-to-chat links.
 *
 * There is no messaging provider and none is needed: a reminder opens wa.me in the browser
 * and the staff member presses send in WhatsApp. That means the only thing that can break is
 * the URL itself, so the construction lives here as pure functions that can be tested without
 * a browser or an account.
 *
 * wa.me requires a FULL international number with no plus sign and no separators. A stored
 * Nepal number is the 10 local digits (9841234567), so the 977 country code must be added —
 * without it wa.me reports "phone number shared via url is invalid".
 */

import { normalizePhone } from '@/lib/validation/phone';

export const NEPAL_COUNTRY_CODE = '977';
export const SALON_NAME = 'The Hair Cut';

/**
 * Local Nepal number -> wa.me digits. Returns null when the number is not a valid Nepal
 * mobile, so callers can disable the action instead of opening a broken link.
 */
export function toWhatsAppNumber(phone) {
  const local = normalizePhone(phone);
  if (!local) return null;
  return `${NEPAL_COUNTRY_CODE}${local}`;
}

/** Human-readable form of the number the message will go to, for the UI. */
export function formatWhatsAppNumber(phone) {
  const wa = toWhatsAppNumber(phone);
  return wa ? `+${wa}` : '';
}

export function buildReminderMessage({ customerName, serviceName, staffName, salonName = SALON_NAME } = {}) {
  const name = String(customerName || '').trim();
  const greeting = name ? `Namaste ${name}` : 'Namaste';
  const servicePart = serviceName ? ` for ${serviceName}` : '';
  const staffPart = staffName ? ` with ${staffName}` : '';
  return `${greeting}, this is a friendly reminder from ${salonName}${servicePart}${staffPart}. We look forward to seeing you.`;
}

/**
 * The full click-to-chat URL, or null when the number cannot be messaged. Never returns a
 * half-built link — a null result is what tells the UI to disable the button and say why.
 */
export function buildWhatsAppUrl(phone, message) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  const text = String(message || '').trim();
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Why a customer cannot be messaged, for inline UI feedback. Null when they can. */
export function whatsAppBlockReason(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return 'No phone number saved';
  if (!toWhatsAppNumber(raw)) return 'Not a valid Nepal mobile number';
  return null;
}
