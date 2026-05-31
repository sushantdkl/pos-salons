export type PublicService = {
  name: string;
  priceLabel: string;
  category: 'Hair' | 'Beard' | 'Beauty' | 'Treatment' | 'Package';
  description: string;
};

export type PublicPackage = {
  name: string;
  price: number;
  includes: string[];
  description: string;
};

export type PublicStaffMember = {
  name: string;
  role: string;
  specialties: string[];
};

export type GalleryItem = {
  title: string;
  description: string;
};
