'use client';

import { type ComponentProps, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { CalendarCheck2, Loader2, MessageCircle } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { createBookingMessage, createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';
import type { PublicPackage, PublicService, PublicStaffMember } from '../types';
import { salonInfo } from '../data/salon-info';

type BookingInfo = typeof salonInfo;

type BookableService = { id: number; name: string; category: string; price: number; duration: number };
type BookableStaff = { id: number; name: string; role: string };
type Availability = { date: string; durationMinutes: number; staff: { id: number; name: string; slots: string[] }[]; anyStaff: string[] };
type Options = {
  enabled: boolean;
  instantConfirm?: boolean;
  maxDaysAhead?: number;
  services?: BookableService[];
  staff?: BookableStaff[];
  availability?: Availability | null;
};
type Confirmation = { number: string; status: string; date: string; startTime: string; endTime: string; services: string[]; staffName: string | null };

const INPUT = 'w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/40 focus:border-transparent focus:ring-2 focus:ring-salon-gold';

function nepalToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu' }).format(new Date());
}
function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function prettyDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Public booking. Online requests create a PENDING appointment the salon confirms (or an
 * instantly confirmed one when the salon enables it and the slot is verifiably free).
 * WhatsApp stays available, and is the only path if online booking is switched off.
 */
export function BookingForm({
  info,
  services,
  packages,
  staff,
  layout = {},
}: {
  info: BookingInfo;
  services: PublicService[];
  packages: PublicPackage[];
  staff: PublicStaffMember[];
  /** Footer/nav extras for the shared public layout (service links, directions). */
  layout?: Omit<ComponentProps<typeof PublicLayout>, 'children' | 'info'>;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const idempotencyKey = useRef(newKey());

  useEffect(() => {
    fetch('/api/public/booking', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { enabled: false }))
      .then(setOptions)
      .catch(() => setOptions({ enabled: false }));
  }, []);

  const online = Boolean(options?.enabled && options.services?.length);
  const bookable = options?.services || [];
  const people = options?.staff || [];
  const selected = bookable.filter((service) => serviceIds.includes(service.id));
  const duration = selected.reduce((sum, service) => sum + service.duration, 0);
  const total = selected.reduce((sum, service) => sum + service.price, 0);
  const today = nepalToday();
  const lastDay = addDays(today, options?.maxDaysAhead || 30);

  useEffect(() => {
    if (!online || !date || !serviceIds.length) { setAvailability(null); return; }
    const params = new URLSearchParams({ date, services: serviceIds.join(',') });
    if (staffId) params.set('staffId', staffId);
    let cancelled = false;
    setLoadingSlots(true);
    fetch(`/api/public/booking?${params}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled) setAvailability(payload.availability || null); })
      .catch(() => { if (!cancelled) setAvailability(null); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [online, date, staffId, serviceIds.join(',')]);

  const slots = useMemo(() => {
    if (!availability) return [];
    return staffId ? availability.staff.find((member) => String(member.id) === staffId)?.slots || [] : availability.anyStaff;
  }, [availability, staffId]);

  useEffect(() => { if (time && !slots.includes(time)) setTime(''); }, [slots, time]);

  const toggleService = (id: number) => {
    setServiceIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 5)));
    setError('');
  };

  const whatsappFallback = () => {
    const serviceNames = selected.length ? selected.map((service) => service.name).join(', ') : '';
    const staffName = people.find((member) => String(member.id) === staffId)?.name || '';
    const message = createBookingMessage({ name, phone, service: serviceNames || 'Not chosen yet', preferredStaff: staffName, date, time, message: notes, salonName: info.name });
    window.open(createWhatsAppLink(message, info.whatsappNumber), '_blank', 'noopener,noreferrer');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!serviceIds.length) return setError('Choose at least one service.');
    if (!date || !time) return setError('Choose a date and one of the available times.');
    if (!name.trim()) return setError('Please enter your name.');
    if (!isValidPhone(phone)) return setError(PHONE_ERROR_MESSAGE);
    setSubmitting(true);
    try {
      const response = await fetch('/api/public/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name, customerPhone: phone, date, startTime: time, serviceIds,
          staffId: staffId ? Number(staffId) : null, notes, website: honeypot, idempotencyKey: idempotencyKey.current,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Your booking could not be sent. Please try again or use WhatsApp.');
        if (response.status === 409) setTime('');
        return;
      }
      setConfirmation(payload.booking);
    } catch {
      setError('Connection problem. Please try again, or send your request on WhatsApp.');
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappOnly = options !== null && !online;
  const legacyServices = useMemo(() => [...services.map((service) => service.name), ...packages.map((item) => item.name)], [services, packages]);

  return (
    <PublicLayout info={info} {...layout}>
      <main className="relative min-h-screen bg-salon-dark">
        <div className="absolute inset-0 h-full w-full">
          <Image src={info.assets.booking} alt={`Booking an appointment at ${info.name}`} fill sizes="100vw" className="object-cover opacity-50" priority />
          <div className="absolute inset-0 bg-gradient-to-br from-salon-cream/0 via-salon-dark-soft/40 to-salon-dark-deep/80" />
        </div>

        <div className="relative z-10 px-4 py-14 sm:px-6 md:py-20">
          <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div className="lg:pt-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-salon-gold">{whatsappOnly ? 'WhatsApp booking' : 'Online booking'}</span>
              <h1 className="mt-4 font-serif text-4xl font-light leading-[1.15] tracking-tight text-white md:text-5xl">Book an appointment</h1>
              <p className="mt-5 max-w-md text-sm font-light leading-relaxed text-white/75 md:text-base">
                {whatsappOnly
                  ? 'Fill in your details and we will open WhatsApp with your booking request ready to send.'
                  : options?.instantConfirm
                    ? 'Pick your services and a free time. Choose a stylist to have the slot confirmed instantly.'
                    : 'Pick your services and a free time. We will confirm your appointment by phone or WhatsApp.'}
              </p>
            </div>

            {confirmation ? (
              <section className="border border-white/15 bg-salon-dark-soft/85 p-6 text-white backdrop-blur-sm md:p-8" aria-live="polite">
                <CalendarCheck2 className="h-10 w-10 text-salon-gold" aria-hidden="true" />
                <h2 className="mt-4 font-serif text-3xl font-light">{confirmation.status === 'CONFIRMED' ? 'You are booked' : 'Request received'}</h2>
                <p className="mt-2 text-sm text-white/75">
                  {confirmation.status === 'CONFIRMED'
                    ? 'Your appointment is confirmed. See you soon!'
                    : 'The salon will contact you shortly to confirm. Your time is not final until then.'}
                </p>
                <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-white/50">Booking number</dt><dd className="text-lg font-semibold text-salon-gold">{confirmation.number}</dd></div>
                  <div><dt className="text-white/50">When</dt><dd>{prettyDate(confirmation.date)}, {confirmation.startTime}–{confirmation.endTime}</dd></div>
                  <div><dt className="text-white/50">Services</dt><dd>{confirmation.services.join(', ')}</dd></div>
                  <div><dt className="text-white/50">Stylist</dt><dd>{confirmation.staffName || 'Any available stylist'}</dd></div>
                </dl>
                <button type="button" onClick={whatsappFallback} className="mt-8 inline-flex items-center gap-2 border border-white/25 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Message the salon on WhatsApp
                </button>
              </section>
            ) : options === null ? (
              <div className="flex items-center justify-center border border-white/15 bg-salon-dark-soft/85 p-10 text-white/70"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>
            ) : whatsappOnly ? (
              <LegacyWhatsAppForm info={info} serviceOptions={legacyServices} staff={staff} />
            ) : (
              <form onSubmit={submit} className="border border-white/15 bg-salon-dark-soft/85 p-5 backdrop-blur-sm md:p-8" noValidate>
                <fieldset>
                  <legend className="mb-2 block text-sm font-semibold text-white/90">1. Services *</legend>
                  {bookable.length > 8 ? <p className="mb-2 text-xs text-white/50">{bookable.length} services — scroll the list for more.</p> : null}
                  <div className="flex max-h-80 flex-wrap gap-2 overflow-y-auto border-b border-white/10 pb-2">

                    {bookable.map((service) => {
                      const on = serviceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleService(service.id)}
                          className={`border px-3 py-2 text-left text-sm transition-colors ${on ? 'border-salon-gold bg-salon-gold text-salon-ink' : 'border-white/20 bg-white/5 text-white hover:border-white/40'}`}
                        >
                          <span className="block font-semibold">{service.name}</span>
                          <span className={`block text-xs ${on ? 'text-salon-ink/70' : 'text-white/50'}`}>{service.duration} min · Rs {service.price.toLocaleString('en-IN')}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selected.length ? <p className="mt-2 text-xs text-white/60">{duration} min · from Rs {total.toLocaleString('en-IN')} (final price at the salon)</p> : null}
                </fieldset>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white/90">2. Stylist</span>
                    <select value={staffId} onChange={(event) => setStaffId(event.target.value)} className={INPUT}>
                      <option value="" className="bg-salon-dark-soft">Any available stylist</option>
                      {people.map((member) => <option key={member.id} value={member.id} className="bg-salon-dark-soft">{member.name} — {member.role}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white/90">3. Date *</span>
                    <input type="date" min={today} max={lastDay} value={date} onChange={(event) => setDate(event.target.value)} className={`${INPUT} [color-scheme:dark]`} />
                  </label>
                </div>

                <div className="mt-5">
                  <span className="mb-2 block text-sm font-semibold text-white/90">4. Time *</span>
                  {!serviceIds.length || !date ? (
                    <p className="text-sm text-white/50">Choose services and a date to see free times.</p>
                  ) : loadingSlots ? (
                    <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Checking free times…</p>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-white/60">No free time that day{staffId ? ' for this stylist' : ''}. Try another day{staffId ? ' or any stylist' : ''}.</p>
                  ) : (
                    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto" role="listbox" aria-label="Available times">
                      {slots.map((slot) => (
                        <button key={slot} type="button" role="option" aria-selected={time === slot} onClick={() => setTime(slot)}
                          className={`min-w-[4.5rem] border px-3 py-2 text-sm tabular-nums ${time === slot ? 'border-salon-gold bg-salon-gold text-salon-ink' : 'border-white/20 text-white hover:border-white/40'}`}>
                          {slot}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white/90">Full name *</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={INPUT} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-white/90">Phone number *</span>
                    <input value={phone} onChange={(event) => setPhone(sanitizePhoneInput(event.target.value))} inputMode="tel" autoComplete="tel" className={INPUT} />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="mb-2 block text-sm font-semibold text-white/90">Message</span>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} className={INPUT} />
                  </label>
                  {/* Honeypot: hidden from people, filled by bots. */}
                  <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} className="hidden" name="website" />
                </div>

                {error ? <div role="alert" className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">{error}</div> : null}

                <button type="submit" disabled={submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-salon-gold px-8 py-4 text-xs font-bold uppercase tracking-wider text-salon-ink transition-all duration-300 hover:bg-[#c39e2e] disabled:opacity-60">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck2 className="h-4 w-4" />}
                  {submitting ? 'Sending…' : options?.instantConfirm && staffId ? 'Book appointment' : 'Request appointment'}
                </button>
                <button type="button" onClick={whatsappFallback} className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-white/20 px-8 py-3 text-xs font-bold uppercase tracking-wider text-white/80 hover:bg-white/5">
                  <MessageCircle className="h-4 w-4" /> Prefer WhatsApp?
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}

/** The original WhatsApp-only request, used when online booking is switched off. */
function LegacyWhatsAppForm({ info, serviceOptions, staff }: { info: BookingInfo; serviceOptions: string[]; staff: PublicStaffMember[] }) {
  const [form, setForm] = useState({ name: '', phone: '', service: '', preferredStaff: '', date: '', time: '', message: '' });
  const [error, setError] = useState('');
  const update = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setError(''); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.service || !form.date || !form.time) {
      setError('Please fill name, phone, service, preferred date, and preferred time.');
      return;
    }
    if (!isValidPhone(form.phone)) { setError(PHONE_ERROR_MESSAGE); return; }
    window.open(createWhatsAppLink(createBookingMessage({ ...form, salonName: info.name }), info.whatsappNumber), '_blank', 'noopener,noreferrer');
  };
  return (
    <form onSubmit={submit} className="border border-white/15 bg-salon-dark-soft/85 p-6 backdrop-blur-sm md:p-8">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="mb-2 block text-sm font-semibold text-white/90">Full Name *</span><input value={form.name} onChange={(event) => update('name', event.target.value)} className={INPUT} /></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold text-white/90">Phone number *</span><input value={form.phone} onChange={(event) => update('phone', sanitizePhoneInput(event.target.value))} className={INPUT} /></label>
        <label className="block md:col-span-2"><span className="mb-2 block text-sm font-semibold text-white/90">Service *</span>
          <select value={form.service} onChange={(event) => update('service', event.target.value)} className={INPUT}>
            <option value="" className="bg-salon-dark-soft">Select service or package</option>
            {serviceOptions.map((service) => <option key={service} value={service} className="bg-salon-dark-soft">{service}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-2 block text-sm font-semibold text-white/90">Preferred staff</span>
          <select value={form.preferredStaff} onChange={(event) => update('preferredStaff', event.target.value)} className={INPUT}>
            <option value="" className="bg-salon-dark-soft">Any available staff</option>
            {staff.map((member) => <option key={member.name} value={member.name} className="bg-salon-dark-soft">{member.name} - {member.role}</option>)}
          </select>
        </label>
        <label className="block"><span className="mb-2 block text-sm font-semibold text-white/90">Preferred date *</span><input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} className={`${INPUT} [color-scheme:dark]`} /></label>
        <label className="block"><span className="mb-2 block text-sm font-semibold text-white/90">Preferred time *</span><input type="time" value={form.time} onChange={(event) => update('time', event.target.value)} className={`${INPUT} [color-scheme:dark]`} /></label>
        <label className="block md:col-span-2"><span className="mb-2 block text-sm font-semibold text-white/90">Message</span><textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} className={INPUT} /></label>
      </div>
      {error ? <div className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">{error}</div> : null}
      <button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-salon-gold px-8 py-4 text-xs font-bold uppercase tracking-wider text-salon-ink transition-all duration-300 hover:bg-[#c39e2e]">
        <MessageCircle className="h-4 w-4" /> Send WhatsApp Booking Request
      </button>
    </form>
  );
}
