export const AADHAR_POS_WORDMARK = 'AADHAR POS';
export const AADHAR_POS_TAGLINE = 'YOUR BUSINESS. OUR BILLING.';
export const AADHAR_POS_VERTICALS = Object.freeze(['Restaurant', 'Retail', 'Salon', 'Cosmetics']);

// Characters that fit the verticals line inside the narrowest printable area each
// paper can report (58 mm roll: ~42 mm at 8px Arial, 80 mm roll: ~68 mm at 9px Arial).
const LINE_CAPACITY = { 58: 38, 80: 58 };

// Only a verified Aadhar website or phone may be printed. It is read from
// NEXT_PUBLIC_AADHAR_POS_CONTACT; when unset the imprint omits contact details.
function configuredContact() {
  const raw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_AADHAR_POS_CONTACT : '';
  return String(raw || '').trim().replace(/\s+/g, ' ').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function verticalsLineLength(verticals, contact) {
  return verticals.join(' • ').length + (verticals.length ? 3 : 0) + AADHAR_POS_WORDMARK.length + (contact ? contact.length + 3 : 0);
}

// Drops trailing verticals, then the contact, until the line fits without wrapping.
function fitVerticals(capacity, contact) {
  for (const candidate of contact ? [contact, ''] : ['']) {
    for (let count = AADHAR_POS_VERTICALS.length; count >= 0; count -= 1) {
      const verticals = AADHAR_POS_VERTICALS.slice(0, count);
      if (verticalsLineLength(verticals, candidate) <= capacity) return { verticals, contact: candidate };
    }
  }
  return { verticals: [], contact: '' };
}

export function getReceiptBranding(paperSize, contact = configuredContact()) {
  const compact = String(paperSize) === '58';
  const fitted = fitVerticals(LINE_CAPACITY[compact ? 58 : 80], contact);
  return Object.freeze({
    thanks: 'Thank you for visiting',
    tagline: AADHAR_POS_TAGLINE,
    verticals: Object.freeze(fitted.verticals),
    wordmark: AADHAR_POS_WORDMARK,
    contact: fitted.contact,
  });
}
