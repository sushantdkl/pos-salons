import type { PublicService } from '../types';

export const publicServices: PublicService[] = [
  { name: 'Hair Cut', priceLabel: 'Rs. 150', category: 'Hair', description: 'Clean haircut with a sharp finish.' },
  { name: 'Hair Wash', priceLabel: 'Rs. 50', category: 'Hair', description: 'Refreshing wash before or after service.' },
  { name: 'Shaving', priceLabel: 'Rs. 100', category: 'Beard', description: 'Neat shave with comfortable finishing.' },
  { name: 'Head Massage', priceLabel: 'Rs. 200', category: 'Treatment', description: 'Relaxing head massage for daily stress relief.' },
  { name: 'Threading', priceLabel: 'Rs. 50', category: 'Beauty', description: 'Clean threading for a polished look.' },
  { name: 'Normal Cleansing', priceLabel: 'Rs. 500', category: 'Beauty', description: 'Simple skin cleansing for routine care.' },
  { name: 'Deep Cleansing', priceLabel: 'Rs. 800', category: 'Beauty', description: 'Detailed cleansing for a fresher feel.' },
  { name: 'Wine Facial', priceLabel: 'Rs. 1200', category: 'Beauty', description: 'Premium facial treatment for glow and care.' },
  { name: 'Fruit Facial', priceLabel: 'Rs. 1500', category: 'Beauty', description: 'Fruit-based facial for a soft refreshed look.' },
  { name: 'Lotus Facial', priceLabel: 'Rs. 1800', category: 'Beauty', description: 'Lotus facial for premium skin care.' },
  { name: 'Hair Colouring', priceLabel: 'Rs. 500 and up', category: 'Hair', description: 'Color service based on hair length and shade.' },
  { name: 'Cap Highlight', priceLabel: 'Rs. 1000 and up', category: 'Hair', description: 'Cap highlighting for a stylish finish.' },
  { name: 'Hair Straight', priceLabel: 'Rs. 1200 and up', category: 'Treatment', description: 'Straightening service based on consultation.' },
  { name: 'Keratin', priceLabel: 'Rs. 1500 and up', category: 'Treatment', description: 'Keratin care for smoother hair.' },
  { name: 'Piece Highlight', priceLabel: 'Rs. 200 per piece', category: 'Hair', description: 'Single-piece highlight for flexible styling.' },
];

export const popularServices = publicServices.filter((service) =>
  ['Hair Cut', 'Shaving', 'Head Massage', 'Wine Facial'].includes(service.name)
);
