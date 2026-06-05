"use client";

import Link from 'next/link';
import { ReactNode, useState, useEffect } from 'react';
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

type PublicLayoutInfo = typeof salonInfo;

export function PublicLayout({ children, info = salonInfo, isHome = false }: { children: ReactNode; info?: PublicLayoutInfo; isHome?: boolean }) {
  const whatsappUrl = createWhatsAppLink(undefined, info.whatsappNumber);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHome]);

  const isDarkTheme = isHome && !scrolled;

  const headerClass = isHome
    ? (scrolled 
        ? "fixed top-0 left-0 right-0 z-40 border-b border-[#e8dcc4] bg-[#fbfaf7]/95 backdrop-blur text-[#171411] shadow-sm transition-all duration-300"
        : "absolute top-0 left-0 right-0 z-40 border-b border-white/10 bg-transparent text-white transition-all duration-300"
      )
    : "sticky top-0 z-40 border-b border-[#e8dcc4] bg-[#fbfaf7]/95 backdrop-blur text-[#171411] transition-all duration-300";

  return (
    <div className="min-h-screen bg-[#fbfaf7] text-[#171411]">
      <header className={headerClass}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3 font-semibold transition hover:opacity-90">
            <span className="relative h-11 w-11 overflow-hidden rounded-full bg-[#171411] border border-white/10">
              <Image src={info.assets.logo} alt={`${info.name} logo`} fill sizes="44px" className="object-cover" />
            </span>
            <span className={isDarkTheme ? "text-white" : "text-[#171411]"}>{info.name}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold tracking-wider uppercase lg:flex">
            {navLinks.map(([label, href]) => (
              <Link 
                key={href} 
                href={href} 
                className={isDarkTheme 
                  ? "text-white/80 transition hover:text-white text-xs" 
                  : "text-[#5f554e] transition hover:text-[#211d1a] text-xs"
                }
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link 
              href="/book-appointment" 
              className={isDarkTheme
                ? "rounded-full bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171411] hover:bg-[#fffaf5] transition-all"
                : "rounded-full bg-[#171411] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#332920] transition-all"
              }
            >
              Book Appointment
            </Link>
            <Link 
              href="/login" 
              className={isDarkTheme
                ? "rounded-full border border-white/20 bg-white/10 backdrop-blur-sm px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition-all"
                : "rounded-full bg-white border border-[#e8dcc4] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[#171411] shadow-sm hover:bg-[#fffaf5] transition-all"
              }
            >
              POS Login
            </Link>
          </div>
        </div>
        <div className={`mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 pb-3 text-xs font-bold uppercase tracking-wider lg:hidden ${
          isDarkTheme ? "border-t border-white/10 pt-2 bg-black/10" : ""
        }`}>
          {navLinks.map(([label, href]) => (
            <Link 
              key={href} 
              href={href} 
              className={`shrink-0 rounded-full px-4 py-2 transition-all ${
                isDarkTheme 
                  ? "bg-white/10 text-white backdrop-blur-sm hover:bg-white/20" 
                  : "bg-white text-[#5f554e] border border-[#e8dcc4] hover:bg-[#fffaf5]"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link 
            href="/book-appointment" 
            className={`shrink-0 rounded-full px-4 py-2 transition-all ${
              isDarkTheme 
                ? "bg-[#d4af37] text-[#171411] font-bold" 
                : "bg-[#171411] text-white"
            }`}
          >
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
                <Image src={info.assets.logo} alt={`${info.name} logo`} fill sizes="48px" className="object-cover" />
              </span>
              <h2 className="text-xl font-semibold">{info.name}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{info.tagline}</p>
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
            <p className="mt-3 text-sm text-white/70">{info.address}</p>
            <p className="mt-2 text-sm text-white/70">{info.phone}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#171411]">WhatsApp</a>
              <a href={info.social.facebook} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white"><Facebook className="h-4 w-4" />Facebook</a>
              <a href={info.social.tiktok} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white"><Music2 className="h-4 w-4" />TikTok</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/60">{info.copyright}</div>
      </footer>
    </div>
  );
}
