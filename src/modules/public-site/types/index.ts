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

export type ServicePageFaq = { question: string; answer: string };

export type ServicePage = {
  id: number | null;
  slug: string;
  name: string;
  heading: string;
  summary: string;
  body: string;
  suitableFor: string;
  serviceNames: string[];
  faqs: ServicePageFaq[];
  related: string[];
  image: string;
  imageAlt: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  seoTitle: string;
  metaDescription: string;
  ogImage: string;
  noindex: boolean;
  sortOrder: number;
  updatedAt: string | null;
};

export type Article = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  coverAlt: string;
  body: string;
  author: string;
  relatedServiceSlug: string;
  seoTitle: string;
  metaDescription: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  updatedAt: string | null;
};

export type PublishedReview = { name: string; rating: number | null; text: string | null; date: string; service: string | null };
