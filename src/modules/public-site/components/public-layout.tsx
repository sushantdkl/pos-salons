import Link from 'next/link';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { Facebook, MessageCircle, Music2 } from 'lucide-react';
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
    <div className="min-h-screen bg-[#fbfaf7] text-[#171411]">
      <header className="sticky top-0 z-40 border-b border-[#e8dcc4] bg-[#fbfaf7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="relative h-11 w-11 overflow-hidden rounded-full bg-[#171411]">
              <Image src={salonInfo.assets.logo} alt={`${salonInfo.name} logo`} fill sizes="44px" className="object-cover" />
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
            <Link href="/book-appointment" className="hidden rounded-full bg-[#171411] px-4 py-2 text-sm font-semibold text-white hover:bg-[#332920] sm:inline-flex">
              Book Appointment
            </Link>
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#d7b56d] px-3 py-2 text-sm font-semibold text-[#171411] hover:bg-white">
              WhatsApp
            </a>
            <Link href="/login" className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-[#171411] shadow-sm hover:bg-[#fffaf5]">
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
          <Link href="/book-appointment" className="shrink-0 rounded-full bg-[#171411] px-3 py-2 text-white">
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

      <footer className="border-t border-[#e7ded2] bg-[#171411] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-3">
              <span className="relative h-12 w-12 overflow-hidden rounded-full bg-white">
                <Image src={salonInfo.assets.logo} alt={`${salonInfo.name} logo`} fill sizes="48px" className="object-cover" />
              </span>
              <h2 className="text-xl font-semibold">{salonInfo.name}</h2>
            </div>
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
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#171411]">WhatsApp</a>
              <a href={salonInfo.social.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white"><Facebook className="h-4 w-4" />Facebook</a>
              <a href={salonInfo.social.tiktok} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white"><Music2 className="h-4 w-4" />TikTok</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/60">{salonInfo.copyright}</div>
      </footer>
    </div>
  );
}
