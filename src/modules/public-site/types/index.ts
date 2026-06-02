export type PublicService = {
  id?: number;
  name: string;
  priceLabel: string;
  price?: number;
  duration?: number;
  serviceCategory?: string;
  category: 'Hair' | 'Beard' | 'Beauty' | 'Treatment' | 'Package';
  description: string;
  image?: string;
  featured?: boolean;
  showOnWebsite?: boolean;
};

export type PublicPackage = {
  id?: number;
  name: string;
  price: number;
  includes: string[];
  description: string;
  image?: string;
  featured?: boolean;
  showOnWebsite?: boolean;
};

export type PublicStaffMember = {
  id?: number;
  name: string;
  role: string;
  bio?: string;
  specialties: string[];
  image?: string;
  featured?: boolean;
  showOnWebsite?: boolean;
};

export type GalleryItem = {
  id?: number;
  title: string;
  description: string;
  image: string;
  altText?: string;
  category?: string;
  sortOrder?: number;
  isVisible?: boolean;
};
