import Image from 'next/image';
import type { PublicPackage, PublicService, PublicStaffMember } from '../types';

export function ServiceCard({
  service,
  variant = 'card',
  compact = false,
  hideCategory = false,
  tone = 'dark',
}: {
  service: PublicService;
  variant?: 'card' | 'menu';
  compact?: boolean;
  hideCategory?: boolean;
  tone?: 'light' | 'dark';
}) {
  if (variant === 'menu') {
    const isLight = tone === 'light';

    return (
      <article
        className={`group grid last:border-b-0 md:grid-cols-[1fr_auto] md:items-center ${
          isLight ? 'border-b border-[#e7ded2]' : 'border-b border-white/10'
        } ${compact ? 'gap-2 py-3' : 'gap-5 py-7 md:items-start'}`}
      >
        <div className="min-w-0">
          {!hideCategory ? (
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${
                isLight ? 'text-[#9b742d]' : 'text-[#d7b56d]'
              }`}
            >
              {service.category}
            </p>
          ) : null}
          <h3
            className={`font-serif font-light tracking-tight ${
              isLight ? 'text-[#171411]' : 'text-white'
            } ${
              compact
                ? `${hideCategory ? '' : 'mt-1 '}text-base md:text-lg`
                : 'mt-2 text-xl md:text-2xl'
            }`}
          >
            {service.name}
          </h3>
          {!compact ? (
            <p
              className={`mt-3 max-w-md text-sm font-light leading-relaxed ${
                isLight ? 'text-[#6d625b]' : 'text-white/60'
              }`}
            >
              {service.description}
            </p>
          ) : null}
          {service.duration ? (
            <p
              className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
                isLight ? 'text-[#8a6a52]' : 'text-white/40'
              } ${compact ? 'mt-1' : 'mt-3'}`}
            >
              {service.duration} min
            </p>
          ) : null}
        </div>
        <p
          className={`shrink-0 font-serif ${
            isLight ? 'text-[#9b742d]' : 'text-[#d7b56d]'
          } ${compact ? 'text-sm md:text-right' : 'text-lg md:text-right md:text-xl'}`}
        >
          {service.priceLabel}
        </p>
      </article>
    );
  }

  return (
    <article className="overflow-hidden border border-[#e7ded2] bg-white">
      {service.image ? (
        <div className="relative aspect-[4/3] bg-[#171411]">
          <Image src={service.image} alt={`${service.name} at The Hair Cut`} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
        </div>
      ) : null}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a6a52]">{service.category}</p>
            <h3 className="mt-2 font-serif text-lg font-light text-[#211d1a]">{service.name}</h3>
          </div>
          <p className="shrink-0 border border-[#e7ded2] bg-[#f8f3ed] px-3 py-1 text-sm font-medium text-[#211d1a]">{service.priceLabel}</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-[#6d625b]">{service.description}</p>
        {service.duration ? <p className="mt-3 text-xs font-semibold text-[#8a6a52]">{service.duration} min</p> : null}
      </div>
    </article>
  );
}

export function PackageCard({
  item,
  variant = 'card',
  featured = false,
}: {
  item: PublicPackage;
  variant?: 'card' | 'tier';
  featured?: boolean;
}) {
  if (variant === 'tier') {
    return (
      <article
        className={`relative flex h-full flex-col border p-7 md:p-8 ${
          featured
            ? 'border-[#d7b56d] bg-white shadow-[0_8px_30px_rgba(155,116,45,0.08)] ring-1 ring-[#d7b56d]/30'
            : 'border-[#e7ded2] bg-white text-[#171411]'
        }`}
      >
        <div className={`absolute left-0 top-0 h-1 w-full ${featured ? 'bg-[#d7b56d]' : 'bg-[#e7ded2]'}`} />
        <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${featured ? 'text-[#9b742d]' : 'text-[#8a6a52]'}`}>
          Grooming tier
        </p>
        <h3 className="mt-4 font-serif text-2xl font-light tracking-tight text-[#171411] md:text-3xl">{item.name}</h3>
        <p className={`mt-5 font-serif text-4xl font-light tracking-tight ${featured ? 'text-[#9b742d]' : 'text-[#171411]'}`}>
          Rs. {item.price}
        </p>
        <p className="mt-4 text-sm font-light leading-relaxed text-[#6d625b]">{item.description}</p>
        <ul className="mt-8 flex-1 space-y-3 border-t border-[#e7ded2] pt-6 text-sm">
          {item.includes.map((service) => (
            <li key={service} className="flex items-start gap-3 text-[#3a312b]">
              <span className={`mt-2 h-1 w-1 shrink-0 ${featured ? 'bg-[#d7b56d]' : 'bg-[#9b742d]'}`} />
              <span className="font-light">{service}</span>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  return (
    <article className="border border-[#e7ded2] bg-white p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#8a6a52]">Men&apos;s Package</p>
      <h3 className="mt-2 font-serif text-2xl font-light text-[#211d1a]">{item.name}</h3>
      <p className="mt-2 font-serif text-3xl font-light text-[#211d1a]">Rs. {item.price}</p>
      <p className="mt-3 text-sm leading-6 text-[#6d625b]">{item.description}</p>
      <ul className="mt-5 grid gap-2 text-sm text-[#3a312b]">
        {item.includes.map((service) => <li key={service}>- {service}</li>)}
      </ul>
    </article>
  );
}

export function StaffCard({
  member,
  variant = 'card',
  tone = 'light',
  layout = 'grid',
}: {
  member: PublicStaffMember;
  variant?: 'card' | 'profile';
  tone?: 'light' | 'dark';
  layout?: 'grid' | 'scroll';
}) {
  if (variant === 'profile') {
    const imageAspect = layout === 'scroll' ? 'aspect-[3/2]' : 'aspect-[5/6]';
    const imageSizes = layout === 'scroll' ? '420px' : '(min-width: 1024px) 25vw, 50vw';

    if (tone === 'dark') {
      return (
        <article className="group flex h-full flex-col border border-white/10 bg-[#0d0b0a]">
          <div className={`relative ${imageAspect} overflow-hidden bg-[#171411]`}>
            {member.image ? (
              <Image
                src={member.image}
                alt={`${member.name} at The Hair Cut`}
                fill
                sizes={imageSizes}
                className="object-cover opacity-85 transition-opacity duration-500 group-hover:opacity-100"
              />
            ) : (
              <div className="flex h-full items-center justify-center font-serif text-5xl font-light text-[#d7b56d]">
                {member.name.charAt(0)}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b0a] via-[#0d0b0a]/10 to-transparent" />
          </div>
          <div className="flex flex-1 flex-col p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d7b56d]">{member.role}</p>
            <h3 className="mt-2 font-serif text-2xl font-light tracking-tight text-white">{member.name}</h3>
            {member.bio ? (
              <p className="mt-3 line-clamp-3 text-sm font-light leading-relaxed text-white/60">{member.bio}</p>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              {member.specialties.map((item) => (
                <span
                  key={item}
                  className="border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </article>
      );
    }

    return (
      <article className="group flex h-full flex-col overflow-hidden border border-[#e7ded2] bg-white transition-shadow duration-300 hover:shadow-md">
        <div className={`relative ${imageAspect} overflow-hidden bg-[#f8f3ed]`}>
          {member.image ? (
            <Image
              src={member.image}
              alt={`${member.name} at The Hair Cut`}
              fill
              sizes={imageSizes}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-[#f8f3ed] font-serif text-5xl font-light text-[#9b742d]">
              {member.name.charAt(0)}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-5 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b742d]">{member.role}</p>
          <h3 className="mt-2 font-serif text-xl font-light tracking-tight text-[#171411] md:text-2xl">{member.name}</h3>
          {member.bio ? (
            <p className="mt-3 line-clamp-3 text-sm font-light leading-relaxed text-[#6d625b]">{member.bio}</p>
          ) : null}
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            {member.specialties.map((item) => (
              <span
                key={item}
                className="border border-[#e7ded2] bg-[#f8f3ed] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5f554e]"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="border border-[#e7ded2] bg-white p-6">
      {member.image ? (
        <div className="relative h-16 w-16 overflow-hidden bg-[#211d1a]">
          <Image src={member.image} alt={`${member.name} at The Hair Cut`} fill sizes="64px" className="object-cover" />
        </div>
      ) : (
        <div className="flex h-16 w-16 items-center justify-center bg-[#211d1a] font-serif text-xl font-light text-white">
          {member.name.charAt(0)}
        </div>
      )}
      <h3 className="mt-5 font-serif text-xl font-light text-[#211d1a]">{member.name}</h3>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#8a6a52]">{member.role}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {member.specialties.map((item) => (
          <span key={item} className="border border-[#e7ded2] bg-[#f8f3ed] px-3 py-1 text-xs font-medium text-[#5f554e]">
            {item}
          </span>
        ))}
      </div>
      {member.bio ? <p className="mt-4 text-sm leading-6 text-[#6d625b]">{member.bio}</p> : null}
    </article>
  );
}
