const DEFAULT_WHATSAPP_NUMBER = '977XXXXXXXXXX';

export function getSalonWhatsAppNumber() {
  return process.env.NEXT_PUBLIC_SALON_WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER;
}

export function createWhatsAppLink(message?: string) {
  const number = getSalonWhatsAppNumber().replace(/[^\dX]/g, '');
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${number}${query}`;
}

export function createBookingMessage({
  name,
  phone,
  service,
  preferredStaff,
  date,
  time,
  message,
}: {
  name: string;
  phone: string;
  service: string;
  preferredStaff?: string;
  date: string;
  time: string;
  message?: string;
}) {
  return [
    'Hello, I want to book a salon appointment.',
    '',
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Service: ${service}`,
    `Preferred Staff: ${preferredStaff || 'Any available staff'}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Message: ${message || '-'}`,
    '',
    'Please confirm my appointment.',
  ].join('\n');
}
