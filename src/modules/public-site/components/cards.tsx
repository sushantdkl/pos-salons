import Image from 'next/image';
import type { PublicPackage, PublicService, PublicStaffMember } from '../types';

export function ServiceCard({ service }: { service: PublicService }) {
  return (
    <article className="rounded-2xl border border-[#e7ded2] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a6a52]">{service.category}</p>
          <h3 className="mt-2 text-lg font-semibold text-[#211d1a]">{service.name}</h3>
        </div>
        <p className="shrink-0 rounded-full bg-[#f8f3ed] px-3 py-1 text-sm font-semibold text-[#211d1a]">{service.priceLabel}</p>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#6d625b]">{service.description}</p>
    </article>
  );
}

export function PackageCard({ item }: { item: PublicPackage }) {
  return (
    <article className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#8a6a52]">Men&apos;s Package</p>
      <h3 className="mt-2 text-2xl font-semibold text-[#211d1a]">{item.name}</h3>
      <p className="mt-2 text-3xl font-semibold text-[#211d1a]">Rs. {item.price}</p>
      <p className="mt-3 text-sm leading-6 text-[#6d625b]">{item.description}</p>
      <ul className="mt-5 grid gap-2 text-sm text-[#3a312b]">
        {item.includes.map((service) => <li key={service}>- {service}</li>)}
      </ul>
    </article>
  );
}

export function StaffCard({ member }: { member: PublicStaffMember }) {
  return (
    <article className="rounded-2xl border border-[#e7ded2] bg-white p-6 shadow-sm">
      {member.image ? (
        <div className="relative h-16 w-16 overflow-hidden rounded-full bg-[#211d1a]">
          <Image src={member.image} alt={`${member.name} at The Hair Cut`} fill sizes="64px" className="object-cover" />
        </div>
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#211d1a] text-xl font-semibold text-white">
          {member.name.charAt(0)}
        </div>
      )}
      <h3 className="mt-5 text-xl font-semibold text-[#211d1a]">{member.name}</h3>
      <p className="mt-1 text-sm font-medium text-[#8a6a52]">{member.role}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {member.specialties.map((item) => <span key={item} className="rounded-full bg-[#f8f3ed] px-3 py-1 text-xs font-medium text-[#5f554e]">{item}</span>)}
      </div>
    </article>
  );
}
