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
      <main className="relative min-h-screen bg-[#12100e]">
        {/* Full background image */}
        <div className="absolute inset-0 w-full h-full">
          <Image 
            src={info.assets.booking} 
            alt={`Booking an appointment at ${info.name}`} 
            fill 
            sizes="100vw" 
            className="object-cover opacity-60" 
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0b0a] via-[#0d0b0a]/80 to-[#0d0b0a]/60" />
        </div>

        {/* Content overlay */}
        <div className="relative z-10 px-4 py-14 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1fr] items-start">
            <div className="lg:pt-8">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#d7b56d]">WhatsApp booking</span>
              <h1 className="mt-4 text-4xl md:text-5xl font-light tracking-tight text-white leading-[1.15] font-serif">Book an appointment</h1>
            </div>
            <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#0d0b0a]/80 backdrop-blur-sm p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/90">Full Name *</span>
                <input value={form.name} onChange={(event) => update('name', event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent placeholder:text-white/40" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/90">Phone number *</span>
                <input value={form.phone} onChange={(event) => update('phone', event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent placeholder:text-white/40" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-white/90">Service *</span>
                <select value={form.service} onChange={(event) => update('service', event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent">
                  <option value="" className="bg-[#0d0b0a]">Select service or package</option>
                  {serviceOptions.map((service) => <option key={service} value={service} className="bg-[#0d0b0a]">{service}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/90">Preferred staff</span>
                <select value={form.preferredStaff} onChange={(event) => update('preferredStaff', event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent">
                  <option value="" className="bg-[#0d0b0a]">Any available staff</option>
                  {staff.map((member) => <option key={member.name} value={member.name} className="bg-[#0d0b0a]">{member.name} - {member.role}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/90">Preferred date *</span>
                <input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent [color-scheme:dark]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/90">Preferred time *</span>
                <input type="time" value={form.time} onChange={(event) => update('time', event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent [color-scheme:dark]" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-white/90">Message</span>
                <textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-[#d7b56d] focus:border-transparent placeholder:text-white/40" />
              </label>
            </div>
            {error ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">{error}</div> : null}
            <button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#d7b56d] px-8 py-4 text-xs font-bold uppercase tracking-wider text-[#171411] hover:bg-[#c39e2e] transition-all duration-300">
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
