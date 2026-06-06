'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { StaffCard } from './cards';
import type { PublicStaffMember } from '../types';

export function StaffCarousel({
  staff,
  tone = 'dark',
}: {
  staff: PublicStaffMember[];
  tone?: 'light' | 'dark';
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollRef.current;
    if (!container) return;

    const card = container.querySelector<HTMLElement>('[data-staff-card]');
    const cardWidth = card?.offsetWidth ?? 360;
    const gap = window.matchMedia('(min-width: 768px)').matches ? 24 : 20;

    container.scrollBy({
      left: direction === 'left' ? -(cardWidth + gap) : cardWidth + gap,
      behavior: 'smooth',
    });
  };

  const arrowClass =
    tone === 'dark'
      ? 'border border-white/20 bg-[#0d0b0a]/90 text-white backdrop-blur-sm hover:border-[#d7b56d]/60 hover:text-[#d7b56d]'
      : 'border border-[#e7ded2] bg-white/95 text-[#171411] backdrop-blur-sm hover:border-[#9b742d]/60 hover:text-[#9b742d]';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => scroll('left')}
        aria-label="Previous staff member"
        className={`absolute left-0 top-[calc(50%-3rem)] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center transition-colors duration-300 md:h-11 md:w-11 ${arrowClass}`}
      >
        <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
      </button>

      <div
        ref={scrollRef}
        className="-mx-6 flex gap-5 overflow-x-auto px-14 pb-2 snap-x snap-mandatory scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] md:gap-6 md:px-16 [&::-webkit-scrollbar]:hidden"
      >
        {staff.map((member) => (
          <div
            key={member.name}
            data-staff-card
            className="w-[min(72vw,420px)] shrink-0 snap-start sm:w-[360px] md:w-[400px] lg:w-[420px]"
          >
            <StaffCard member={member} variant="profile" tone={tone} layout="scroll" />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scroll('right')}
        aria-label="Next staff member"
        className={`absolute right-0 top-[calc(50%-3rem)] z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center transition-colors duration-300 md:h-11 md:w-11 ${arrowClass}`}
      >
        <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
      </button>
    </div>
  );
}
