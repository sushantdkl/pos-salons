import type { PublicPackage } from '../types';

export const publicPackages: PublicPackage[] = [
  {
    name: 'Silver Package',
    price: 650,
    includes: ['Hair Cut', 'Hair Wash', 'Shaving', 'Normal Cleansing'],
    description: 'A balanced everyday grooming package.',
  },
  {
    name: 'Gold Package',
    price: 850,
    includes: ['Hair Cut', 'Hair Wash', 'Shaving', 'Deep Cleansing'],
    description: 'A deeper grooming refresh with upgraded cleansing.',
  },
  {
    name: 'Platinum Package',
    price: 1450,
    includes: ['Hair Cut', 'Hair Wash', 'Shaving', 'Head Massage', 'Facial'],
    description: 'A complete premium grooming and relaxation package.',
  },
];
