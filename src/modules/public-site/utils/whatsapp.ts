import { salonInfo } from '../data/salon-info';

export function getSalonWhatsAppNumber() {
  return salonInfo.whatsappNumber || process.env.NEXT_PUBLIC_SALON_WHATSAPP_NUMBER || '';
}

export function createWhatsAppLink(message?: string, whatsappNumber?: string) {
  const number = (whatsappNumber || getSalonWhatsAppNumber()).replace(/[^\dX]/g, '');
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
  salonName,
}: {
  name: string;
  phone: string;
  service: string;
  preferredStaff?: string;
  date: string;
  time: string;
  message?: string;
  salonName?: string;
}) {
  return [
    `Hello ${salonName || salonInfo.name}, I want to book an appointment.`,
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
