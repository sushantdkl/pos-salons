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
      <main className="px-4 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#8a6a52]">WhatsApp booking</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#211d1a]">Book an appointment</h1>
            <p className="mt-4 leading-7 text-[#6d625b]">
              Send a WhatsApp appointment request to {info.name} with your preferred service, staff, date, and time.
            </p>
            <div className="relative mt-8 min-h-[360px] overflow-hidden rounded-3xl bg-[#171411] shadow-sm">
              <Image src={info.assets.booking} alt={`Booking an appointment at ${info.name}`} fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <p className="absolute bottom-5 left-5 right-5 text-lg font-semibold text-white">{info.tagline}</p>
            </div>
          </div>
          <form onSubmit={submit} className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Full Name *</span>
                <input value={form.name} onChange={(event) => update('name', event.target.value)} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Phone number *</span>
                <input value={form.phone} onChange={(event) => update('phone', event.target.value)} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold">Service *</span>
                <select value={form.service} onChange={(event) => update('service', event.target.value)} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]">
                  <option value="">Select service or package</option>
                  {serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Preferred staff</span>
                <select value={form.preferredStaff} onChange={(event) => update('preferredStaff', event.target.value)} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]">
                  <option value="">Any available staff</option>
                  {staff.map((member) => <option key={member.name} value={member.name}>{member.name} - {member.role}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Preferred date *</span>
                <input type="date" value={form.date} onChange={(event) => update('date', event.target.value)} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Preferred time *</span>
                <input type="time" value={form.time} onChange={(event) => update('time', event.target.value)} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold">Message</span>
                <textarea value={form.message} onChange={(event) => update('message', event.target.value)} rows={4} className="w-full rounded-xl border border-[#d9cabc] px-4 py-3 outline-none focus:ring-2 focus:ring-[#211d1a]" />
              </label>
            </div>
            {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
            <button type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700">
              <MessageCircle className="h-5 w-5" />
              Send WhatsApp Booking Request
            </button>
          </form>
        </div>
      </main>
    </PublicLayout>
  );
}
