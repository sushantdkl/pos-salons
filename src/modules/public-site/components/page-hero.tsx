import { CmsImage } from './cms-image';
import { Breadcrumbs, type Crumb } from './breadcrumbs';

export function PageHero({
  eyebrow,
  title,
  description,
  imageUrl,
  breadcrumbs,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  /** Trail after Home, ending with the current page. Renders visible crumbs + BreadcrumbList. */
  breadcrumbs?: Crumb[];
}) {
  return (
    <section className="relative overflow-hidden border-b border-[#e7ded2]/60 bg-[#fbfaf7]">
      {imageUrl ? (
        <div className="pointer-events-none absolute inset-0">
          {/* Decorative wash at 12% opacity: low quality is invisible here and keeps LCP fast. */}
          <CmsImage src={imageUrl} alt="" fill priority quality={30} sizes="100vw" className="object-cover opacity-[0.12]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#fbfaf7] via-[#fbfaf7]/95 to-[#fbfaf7]/80" />
        </div>
      ) : null}
      <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-28 md:pb-14 md:pt-32">
        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
        {eyebrow ? (
          <span className="mb-3 block text-xs font-semibold uppercase tracking-widest text-[#8a6727] md:text-sm">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="max-w-3xl font-serif text-4xl font-light tracking-tight text-[#171411] md:text-5xl lg:text-6xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 max-w-2xl text-sm font-light leading-relaxed text-[#6d625b] md:text-base">
            {description}
          </p>
        ) : null}
      </div>
    </section>
  );
}
