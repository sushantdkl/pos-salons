'use client';

import { FormEvent, useMemo, useState } from 'react';
import Image from 'next/image';
import { MessageCircle } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { createBookingMessage, createWhatsAppLink } from '@/modules/public-site/utils/whatsapp';
import type { PublicPackage, PublicService, PublicStaffMember } from '../types';
import { salonInfo } from '../data/salon-info';

const initialForm = {
  name: '',
  phone: '',
  service: '',
  preferredStaff: '',
  date: '',
  time: '',
  message: '',
};

type BookingInfo = typeof salonInfo;

export function BookingForm({
  info,
  services,
  packages,
  staff,
}: {
  info: BookingInfo;
  services: PublicService[];
  packages: PublicPackage[];
  staff: PublicStaffMember[];
}) {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const serviceOptions = useMemo(() => [
    ...services.map((service) => service.name),
    ...packages.map((item) => item.name),
  ], [services, packages]);

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.service || !form.date || !form.time) {
      setError('Please fill name, phone, service, preferred date, and preferred time.');
      return;
    }

    const message = createBookingMessage({ ...form, salonName: info.name });
    window.open(createWhatsAppLink(message, info.whatsappNumber), '_blank', 'noopener,noreferrer');
  };

  return (
    <PublicLayout info={info}>
      <main className="relative min-h-screen bg-salon-dark">
        <div className="absolute inset-0 h-full w-full">
          <Image
            src={info.assets.booking}
            alt={`Booking an appointment at ${info.name}`}
            fill
            sizes="100vw"
            className="object-cover opacity-50"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-salon-cream/0 via-salon-dark-soft/40 to-salon-dark-deep/80" />
        </div>

        <div className="relative z-10 px-6 py-14 md:py-20">
          <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div className="lg:pt-6">
              <span className="text-xs font-semibold uppercase tracking-widest text-salon-gold">WhatsApp booking</span>
              <h1 className="mt-4 font-serif text-4xl font-light leading-[1.15] tracking-tight text-white md:text-5xl">
                Book an appointment
              </h1>
              <p className="mt-5 max-w-md text-sm font-light leading-relaxed text-white/75 md:text-base">
                Fill in your details and we will open WhatsApp with your booking request ready to send.
              </p>
            </div>
            <form
              onSubmit={submit}
              className="border border-white/15 bg-salon-dark-soft/85 p-6 backdrop-blur-sm md:p-8"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Full Name *</span>
                  <input
                    value={form.name}
                    onChange={(event) => update('name', event.target.value)}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/40 focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Phone number *</span>
                  <input
                    value={form.phone}
                    onChange={(event) => update('phone', event.target.value)}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/40 focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Service *</span>
                  <select
                    value={form.service}
                    onChange={(event) => update('service', event.target.value)}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  >
                    <option value="" className="bg-salon-dark-soft">Select service or package</option>
                    {serviceOptions.map((service) => (
                      <option key={service} value={service} className="bg-salon-dark-soft">{service}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Preferred staff</span>
                  <select
                    value={form.preferredStaff}
                    onChange={(event) => update('preferredStaff', event.target.value)}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  >
                    <option value="" className="bg-salon-dark-soft">Any available staff</option>
                    {staff.map((member) => (
                      <option key={member.name} value={member.name} className="bg-salon-dark-soft">
                        {member.name} - {member.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Preferred date *</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) => update('date', event.target.value)}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Preferred time *</span>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => update('time', event.target.value)}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none [color-scheme:dark] focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="mb-2 block text-sm font-semibold text-white/90">Message</span>
                  <textarea
                    value={form.message}
                    onChange={(event) => update('message', event.target.value)}
                    rows={4}
                    className="w-full border border-white/20 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/40 focus:border-transparent focus:ring-2 focus:ring-salon-gold"
                  />
                </label>
              </div>
              {error ? (
                <div className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-salon-gold px-8 py-4 text-xs font-bold uppercase tracking-wider text-salon-ink transition-all duration-300 hover:bg-[#c39e2e]"
              >
                <MessageCircle className="h-4 w-4" />
                Send WhatsApp Booking Request
              </button>
            </form>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
}
