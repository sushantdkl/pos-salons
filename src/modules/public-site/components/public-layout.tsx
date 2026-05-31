import Link from 'next/link';
import type { ReactNode } from 'react';
import { MessageCircle, Scissors } from 'lucide-react';
import { salonInfo } from '../data/salon-info';
import { createWhatsAppLink } from '../utils/whatsapp';

const navLinks = [
  ['Home', '/'],
  ['Services', '/services'],
  ['Packages', '/packages'],
  ['Staff', '/staff'],
  ['Gallery', '/gallery'],
  ['Contact', '/contact'],
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const whatsappUrl = createWhatsAppLink();

  return (
    <div className="min-h-screen bg-[#f8f3ed] text-[#211d1a]">
      <header className="sticky top-0 z-40 border-b border-[#e7ded2] bg-[#f8f3ed]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#211d1a] text-white">
              <Scissors className="h-5 w-5" />
            </span>
            <span>{salonInfo.name}</span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-medium text-[#5f554e] lg:flex">
            {navLinks.map(([label, href]) => (
              <Link key={href} href={href} className="transition hover:text-[#211d1a]">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/book-appointment" className="hidden rounded-full bg-[#211d1a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3a312b] sm:inline-flex">
              Book Appointment
            </Link>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#d9cabc] px-3 py-2 text-sm font-semibold text-[#211d1a] hover:bg-white">
              WhatsApp
            </a>
            <Link href="/login" className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#211d1a] shadow-sm hover:bg-[#fffaf5]">
              POS Login
            </Link>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 text-sm font-medium text-[#5f554e] lg:hidden">
          {navLinks.map(([label, href]) => (
            <Link key={href} href={href} className="shrink-0 rounded-full bg-white px-3 py-2">
              {label}
            </Link>
          ))}
          <Link href="/book-appointment" className="shrink-0 rounded-full bg-[#211d1a] px-3 py-2 text-white">
            Book
          </Link>
        </div>
      </header>

      {children}

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition hover:bg-green-700"
        aria-label="Chat on WhatsApp"
      >
        <MessageCircle className="h-6 w-6" />
      </a>

      <footer className="border-t border-[#e7ded2] bg-[#211d1a] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
          <div>
            <h2 className="text-xl font-semibold">{salonInfo.name}</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">{salonInfo.tagline}</p>
          </div>
          <div>
            <h3 className="font-semibold">Quick Links</h3>
            <div className="mt-3 grid gap-2 text-sm text-white/70">
              {navLinks.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
              <Link href="/book-appointment">Book Appointment</Link>
            </div>
          </div>
          <div>
            <h3 className="font-semibold">Contact</h3>
            <p className="mt-3 text-sm text-white/70">{salonInfo.address}</p>
            <p className="mt-2 text-sm text-white/70">{salonInfo.phone}</p>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#211d1a]">
              WhatsApp
            </a>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/60">{salonInfo.copyright}</div>
      </footer>
    </div>
  );
}
