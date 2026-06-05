import type { ReactNode } from 'react';

type SectionTheme = 'light' | 'dark';

const themeStyles: Record<SectionTheme, { section: string; eyebrow: string; title: string; description: string }> = {
  light: {
    section: 'border-b border-[#e7ded2]/40 bg-[#fbfaf7] text-[#171411]',
    eyebrow: 'text-[#9b742d]',
    title: 'text-[#171411]',
    description: 'text-[#6d625b]',
  },
  dark: {
    section: 'border-b border-white/10 bg-[#12100e] text-white',
    eyebrow: 'text-[#d7b56d]',
    title: 'text-white',
    description: 'text-white/70',
  },
};

export function Section({
  eyebrow,
  title,
  description,
  children,
  theme = 'light',
  className = '',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  theme?: SectionTheme;
  className?: string;
}) {
  const styles = themeStyles[theme];

  return (
    <section className={`px-6 py-16 md:py-24 last:border-b-0 ${styles.section} ${className}`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-3xl">
          {eyebrow ? (
            <span className={`text-xs md:text-sm font-semibold uppercase tracking-widest block mb-3 ${styles.eyebrow}`}>
              {eyebrow}
            </span>
          ) : null}
          <h2 className={`text-3xl md:text-5xl font-light tracking-tight font-serif leading-tight ${styles.title}`}>
            {title}
          </h2>
          {description ? (
            <p className={`mt-4 text-sm md:text-base font-light leading-relaxed max-w-2xl ${styles.description}`}>
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}
