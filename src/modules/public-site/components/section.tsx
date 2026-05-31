import type { ReactNode } from 'react';

export function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-14 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-2xl">
          {eyebrow ? <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#8a6a52]">{eyebrow}</p> : null}
          <h2 className="text-3xl font-semibold tracking-tight text-[#211d1a] sm:text-4xl">{title}</h2>
          {description ? <p className="mt-3 leading-7 text-[#6d625b]">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}
