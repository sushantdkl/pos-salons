import Link from 'next/link';
import { SiteShell } from '@/modules/public-site/components/site-shell';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

/** Branded 404. Next.js serves it with a real HTTP 404 status. */
export default function NotFound() {
  const links = [
    ['Home', '/'],
    ['Services & prices', '/services'],
    ['Book an appointment', '/book-appointment'],
    ['Contact & directions', '/contact'],
  ];
  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-6 pb-20 pt-32">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#8a6727]">404</p>
        <h1 className="mt-3 font-serif text-4xl font-light tracking-tight text-[#171411] md:text-5xl">This page isn&apos;t here</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[#6d625b]">
          The link may be old or mistyped. These pages will get you where you need to go:
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {links.map(([label, href]) => (
            <li key={href}>
              <Link href={href} className="flex min-h-12 items-center justify-between border border-[#e7ded2] bg-white px-5 text-sm font-semibold text-[#171411] hover:border-[#d7b56d]">
                {label}
                <span aria-hidden="true" className="text-[#d7b56d]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </SiteShell>
  );
}
