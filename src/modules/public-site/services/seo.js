/**
 * SEO & Local Search for the PUBLIC website.
 *
 * One place that decides titles, descriptions, canonicals, robots, structured data, service
 * landing pages, guides and redirects. Business facts (name, phone, address, hours) come from the
 * Website CMS contact section plus the SEO settings row — nothing here is hard-coded twice.
 *
 * Every reader tolerates the migration not being applied yet (falls back to defaults), so the
 * public site never breaks because of SEO tables.
 */
import { cache } from 'react';
import Database from '@/lib/db/index';
import { cleanText } from '@/lib/salon-schema';
import { absoluteUrl, normalizePath, siteUrl, slugify } from '@/lib/seo/site';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const PAGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export const DEFAULT_KEYWORDS = [
  'salon in Surkhet',
  'hair salon Surkhet',
  'haircut in Surkhet',
  'haircut Birendranagar',
  'salon Birendranagar',
  'barber Surkhet',
  'barber shop Surkhet',
  "men's grooming Surkhet",
  'facial Surkhet',
  'hair colour Surkhet',
];

/** Google Business Profile audit items (checklist only — the profile is edited by the owner in Google). */
export const GBP_CHECKLIST = [
  ['name', 'Business name', 'Exactly "The Hair Cut" — no keywords, city or "best" added.'],
  ['primaryCategory', 'Primary category', 'The most accurate category, e.g. "Barber shop" or "Hair salon". Keep it truthful.'],
  ['additionalCategories', 'Additional categories', 'Only categories for services you really offer (e.g. "Beauty salon" if facials are a regular service).'],
  ['address', 'Address', 'Matches the website address character for character.'],
  ['mapPin', 'Map pin', 'Pin sits on the actual shop entrance.'],
  ['phone', 'Phone', 'Same number as the website footer and contact page.'],
  ['website', 'Website', 'https://thehaircut.com.np/ (no www, https).'],
  ['booking', 'Booking / appointment link', 'https://thehaircut.com.np/book-appointment'],
  ['hours', 'Opening hours', 'Same hours as SEO & Local Search → Local Business.'],
  ['specialHours', 'Special hours', 'Dashain, Tihar and other closures entered in advance.'],
  ['services', 'Services', 'Mirror the real price list: Hair Cut, Shaving, Facials, Hair Colour, Keratin …'],
  ['description', 'Description', 'Plain description of the salon and its services. No keyword lists, no URLs.'],
  ['photos', 'Photos', 'Real photos: shop front, interior, team, finished cuts (with consent). Add new ones monthly.'],
  ['logo', 'Logo', 'Upload the same logo as the website.'],
  ['cover', 'Cover photo', 'A real, well-lit photo of the salon.'],
  ['attributes', 'Attributes', 'Only attributes that are true (e.g. payment methods, wheelchair access).'],
  ['reviews', 'Reply to reviews', 'Reply politely to every review, good or bad.'],
];

export function defaultSeoSettings() {
  return {
    businessType: 'HairSalon',
    businessDescriptor: "Men's salon",
    streetAddress: 'Birendranagar-7',
    locality: 'Birendranagar',
    district: 'Surkhet',
    region: 'Karnali Province',
    postalCode: '',
    country: 'NP',
    landmark: '',
    parking: '',
    latitude: '',
    longitude: '',
    hours: WEEKDAYS.map((day) => ({ day, closed: false, opens: '', closes: '' })),
    priceRange: '',
    instagram: '',
    youtube: '',
    googleMapsUrl: '',
    googleReviewUrl: '',
    googleReviewEnabled: true,
    gscVerification: '',
    bingVerification: '',
    keywords: [...DEFAULT_KEYWORDS],
    gbpChecklist: {},
    citations: [],
  };
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 't';
}

function text(value, fallback = '', max = 500) {
  return cleanText(value, fallback).slice(0, max);
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeHttpsUrl(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  try {
    const url = new URL(cleaned);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function coordinate(value, min, max) {
  const cleaned = String(value ?? '').trim();
  if (!cleaned) return '';
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= min && number <= max ? String(number) : '';
}

function time(value) {
  const cleaned = String(value || '').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned) ? cleaned : '';
}

/** Google Search Console gives either the bare token or the whole <meta> tag — accept both. */
function verificationToken(value) {
  const cleaned = String(value || '').trim();
  const match = cleaned.match(/content=["']([^"']+)["']/i);
  const token = match ? match[1] : cleaned;
  return /^[A-Za-z0-9_\-]{10,120}$/.test(token) ? token : '';
}

export function normalizeSeoSettings(input = {}) {
  const defaults = defaultSeoSettings();
  const merged = { ...defaults, ...(input || {}) };
  const hoursInput = Array.isArray(merged.hours) ? merged.hours : [];
  return {
    businessType: ['HairSalon', 'BarberShop', 'BeautySalon'].includes(merged.businessType) ? merged.businessType : 'HairSalon',
    businessDescriptor: text(merged.businessDescriptor, defaults.businessDescriptor, 60) || defaults.businessDescriptor,
    streetAddress: text(merged.streetAddress, '', 120),
    locality: text(merged.locality, '', 80),
    district: text(merged.district, '', 80),
    region: text(merged.region, '', 80),
    postalCode: text(merged.postalCode, '', 12),
    country: /^[A-Z]{2}$/.test(String(merged.country || '')) ? merged.country : 'NP',
    landmark: text(merged.landmark, '', 200),
    parking: text(merged.parking, '', 200),
    latitude: coordinate(merged.latitude, -90, 90),
    longitude: coordinate(merged.longitude, -180, 180),
    hours: WEEKDAYS.map((day) => {
      const row = hoursInput.find((item) => item?.day === day) || {};
      return { day, closed: Boolean(row.closed), opens: time(row.opens), closes: time(row.closes) };
    }),
    priceRange: text(merged.priceRange, '', 40),
    instagram: safeHttpsUrl(merged.instagram),
    youtube: safeHttpsUrl(merged.youtube),
    googleMapsUrl: safeHttpsUrl(merged.googleMapsUrl),
    googleReviewUrl: safeHttpsUrl(merged.googleReviewUrl),
    googleReviewEnabled: merged.googleReviewEnabled !== false,
    gscVerification: verificationToken(merged.gscVerification),
    bingVerification: verificationToken(merged.bingVerification),
    keywords: [...new Set((Array.isArray(merged.keywords) ? merged.keywords : []).map((value) => text(value, '', 80)).filter(Boolean))].slice(0, 50),
    gbpChecklist: Object.fromEntries(GBP_CHECKLIST.map(([key]) => {
      const row = merged.gbpChecklist?.[key] || {};
      return [key, { status: ['todo', 'done', 'na'].includes(row.status) ? row.status : 'todo', note: text(row.note, '', 300) }];
    })),
    citations: (Array.isArray(merged.citations) ? merged.citations : []).slice(0, 40).map((row) => ({
      name: text(row?.name, '', 80),
      url: safeHttpsUrl(row?.url),
      status: ['listed', 'needs-fix', 'todo'].includes(row?.status) ? row.status : 'todo',
      note: text(row?.note, '', 200),
    })).filter((row) => row.name),
  };
}

/* ------------------------------------------------------------------ opening hours */

function to12h(value) {
  const [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function hoursConfigured(hours = []) {
  return hours.some((row) => row.closed || (row.opens && row.closes));
}

/** "Sunday – Friday: 8:00 AM – 7:30 PM · Saturday: Closed" — grouped consecutive days. */
export function formatHours(hours = []) {
  if (!hoursConfigured(hours)) return '';
  const label = (row) => (row.closed ? 'Closed' : row.opens && row.closes ? `${to12h(row.opens)} – ${to12h(row.closes)}` : 'Call to confirm');
  const groups = [];
  hours.forEach((row) => {
    const value = label(row);
    const last = groups[groups.length - 1];
    if (last && last.value === value) last.to = row.day;
    else groups.push({ from: row.day, to: row.day, value });
  });
  return groups.map((group) => `${group.from === group.to ? group.from : `${group.from} – ${group.to}`}: ${group.value}`).join(' · ');
}

/* ------------------------------------------------------------------ data access */

async function tableExists(db, name) {
  const row = await db.get(
    'SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?) AS exists',
    [name]
  );
  return bool(row?.exists);
}

async function seoSchemaReady(db) {
  return tableExists(db, 'website_seo_settings');
}

export async function assertSeoSchema(db) {
  if (!(await seoSchemaReady(db))) {
    const error = httpError('SEO tables are missing. Run `npm run db:migrate` (docs/migrations/2026-10-02-seo-local-search.sql) first.', 503);
    error.code = 'SEO_SCHEMA_MISSING';
    throw error;
  }
}

export async function readSeoSettings(db) {
  try {
    if (!(await seoSchemaReady(db))) return defaultSeoSettings();
    const row = await db.get('SELECT settings FROM website_seo_settings WHERE id = 1');
    const raw = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
    return normalizeSeoSettings(raw || {});
  } catch {
    return defaultSeoSettings();
  }
}

async function readPageSeoRows(db) {
  try {
    if (!(await tableExists(db, 'website_page_seo'))) return [];
    return await db.all('SELECT * FROM website_page_seo ORDER BY path');
  } catch {
    return [];
  }
}

function mapPageSeo(row) {
  return {
    path: row.path,
    seoTitle: row.seo_title || '',
    metaDescription: row.meta_description || '',
    ogTitle: row.og_title || '',
    ogDescription: row.og_description || '',
    ogImage: row.og_image || '',
    canonicalOverride: row.canonical_override || '',
    noindex: bool(row.noindex),
  };
}

/* ------------------------------------------------------------------ service landing pages */

/**
 * Starting content for service pages. Each lists REAL services by exact price-list name; a page
 * with no matching visible service is not published (404 + left out of the sitemap). Copy is plain
 * and factual — the owner should edit it in SEO & Local Search → Service pages with real detail.
 */
export const DEFAULT_SERVICE_PAGES = [
  {
    slug: 'haircut',
    name: 'Haircut',
    heading: 'Haircut in Birendranagar, Surkhet',
    summary: 'Haircuts at The Hair Cut in Birendranagar-7, Surkhet — tell the barber the look you want and get a clean, even finish.',
    body: 'A good haircut starts with a short conversation: how you wear your hair, how often you visit, and how much time you spend styling it at home. Our barbers then cut to suit your hair type and face shape, and tidy the neckline and sideburns so the cut grows out evenly.\n\nAdd a hair wash before or after your cut, or choose a grooming package if you also want a shave and cleansing in the same visit.',
    suitableFor: 'Regular trims, a new style, school and office cuts, and a fresh cut before an event.',
    serviceNames: ['Hair Cut', 'Hair Wash'],
    related: ['shaving', 'hair-colour', 'facials-skin-care'],
    image: '/assets/Haircut1.jpg',
    imageAlt: 'Haircut in progress at The Hair Cut, Birendranagar',
  },
  {
    slug: 'shaving',
    name: 'Shaving',
    heading: 'Shaving in Birendranagar, Surkhet',
    summary: 'A neat shave at The Hair Cut, Birendranagar-7 — clean lines and a comfortable finish.',
    body: 'Come in for a quick clean shave on its own, or pair it with a haircut. The barber shapes the lines around the cheeks and neck so the result looks tidy from every side.\n\nIf your skin is sensitive, tell the barber before starting.',
    suitableFor: 'A clean everyday shave, tidying the neckline, or a fresh look before a function.',
    serviceNames: ['Shaving'],
    related: ['haircut', 'facials-skin-care'],
    image: '/assets/shaving.jpg',
    imageAlt: 'Shaving service at The Hair Cut, Surkhet',
  },
  {
    slug: 'hair-colour',
    name: 'Hair Colour',
    heading: 'Hair Colour & Highlights in Surkhet',
    summary: 'Hair colouring, cap highlights and piece highlights at The Hair Cut, Birendranagar. Price depends on hair length and shade.',
    body: 'Hair colour is priced after a quick look at your hair: its length, current colour and the shade you want. Full colour covers grey or changes your base shade; cap highlights and single-piece highlights add lighter strands for a softer change.\n\nAsk the staff about aftercare — coloured hair keeps its shade longer with a gentle shampoo and less direct sun.',
    suitableFor: 'Covering grey, a new shade, or subtle highlights.',
    serviceNames: ['Hair Colouring', 'Cap Highlight', 'Piece Highlight'],
    related: ['haircut', 'hair-straightening-keratin'],
    image: '',
    imageAlt: '',
  },
  {
    slug: 'hair-straightening-keratin',
    name: 'Hair Straightening & Keratin',
    seoTitle: 'Hair Straightening & Keratin in Surkhet | The Hair Cut',
    heading: 'Hair Straightening & Keratin in Surkhet',
    summary: 'Hair straightening and keratin treatment at The Hair Cut, Birendranagar. Priced after a consultation.',
    body: 'Straightening and keratin treatments take longer than a cut, so the price and time are confirmed after the staff check your hair length and condition.\n\nSend an appointment request with your preferred time so the chair can be kept free for the full treatment.',
    suitableFor: 'Frizzy or hard-to-manage hair, and anyone who wants smoother hair between cuts.',
    serviceNames: ['Hair Straight', 'Keratin'],
    related: ['hair-colour', 'haircut'],
    image: '',
    imageAlt: '',
  },
  {
    slug: 'facials-skin-care',
    name: 'Facials & Skin Care',
    heading: 'Facials, Cleansing & Threading in Surkhet',
    summary: 'Facials, skin cleansing and threading at The Hair Cut, Birendranagar-7, with prices listed up front.',
    body: 'Choose a normal cleansing for routine care, a deep cleansing for a more thorough clean, or one of the facials for a longer treatment. Threading is available for a tidy finish.\n\nFacials can be booked on their own or as part of a grooming package together with a haircut and shave.',
    suitableFor: 'Routine skin care, a refresh before a wedding or festival, and tidy brows.',
    serviceNames: ['Normal Cleansing', 'Deep Cleansing', 'Wine Facial', 'Fruit Facial', 'Lotus Facial', 'Threading'],
    related: ['haircut', 'shaving'],
    image: '',
    imageAlt: '',
  },
].map((page, index) => ({
  id: null,
  faqs: [],
  status: 'PUBLISHED',
  seoTitle: '',
  metaDescription: '',
  ogImage: '',
  noindex: false,
  sortOrder: index + 1,
  updatedAt: null,
  ...page,
}));

function csv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function mapServicePage(row) {
  const faqs = typeof row.faqs === 'string' ? JSON.parse(row.faqs || '[]') : row.faqs || [];
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    heading: row.heading,
    summary: row.summary || '',
    body: row.body || '',
    suitableFor: row.suitable_for || '',
    serviceNames: csv(row.service_names),
    faqs: Array.isArray(faqs) ? faqs : [],
    related: csv(row.related_slugs),
    image: row.image_url || '',
    imageAlt: row.image_alt || '',
    status: row.status,
    seoTitle: row.seo_title || '',
    metaDescription: row.meta_description || '',
    ogImage: row.og_image || '',
    noindex: bool(row.noindex),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function readServicePages(db) {
  try {
    if (!(await tableExists(db, 'website_service_pages'))) return { pages: DEFAULT_SERVICE_PAGES, stored: false };
    const rows = await db.all('SELECT * FROM website_service_pages ORDER BY sort_order ASC, id ASC');
    return rows.length ? { pages: rows.map(mapServicePage), stored: true } : { pages: DEFAULT_SERVICE_PAGES, stored: false };
  } catch {
    return { pages: DEFAULT_SERVICE_PAGES, stored: false };
  }
}

/** Real price-list services and packages that belong to a service page. */
export function matchServices(page, cms) {
  const wanted = new Set(page.serviceNames.map((name) => name.toLowerCase()));
  const services = (cms.services || []).filter((service) => wanted.has(String(service.name).toLowerCase()));
  const packages = (cms.packages || []).filter((item) => (item.includes || []).some((name) => wanted.has(String(name).toLowerCase())));
  return { services, packages };
}

/** Published + has at least one real visible service. Anything else is not a public page. */
export function isServicePageLive(page, cms) {
  return page.status === 'PUBLISHED' && matchServices(page, cms).services.length > 0;
}

/* ------------------------------------------------------------------ guides / articles */

function mapArticle(row) {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    coverImage: row.cover_image || '',
    coverAlt: row.cover_alt || '',
    body: row.body || '',
    author: row.author || '',
    relatedServiceSlug: row.related_service_slug || '',
    seoTitle: row.seo_title || '',
    metaDescription: row.meta_description || '',
    status: row.status,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function readArticles(db, { publishedOnly = true } = {}) {
  try {
    if (!(await tableExists(db, 'website_articles'))) return [];
    const rows = await db.all(`SELECT * FROM website_articles ${publishedOnly ? "WHERE status = 'PUBLISHED'" : ''} ORDER BY COALESCE(published_at, created_at) DESC, id DESC`);
    return rows.map(mapArticle);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ request-scoped context */

/**
 * Everything a public page needs for SEO, loaded once per request (React cache): CMS content,
 * SEO settings, page overrides, service pages and published guides.
 */
export const getSiteContext = cache(async () => {
  const cms = await getPublicWebsiteData();
  const db = Database.getInstance();
  const [settings, pageSeoRows, servicePageData, articles] = await Promise.all([
    readSeoSettings(db),
    readPageSeoRows(db),
    readServicePages(db),
    readArticles(db),
  ]);
  const structuredHours = formatHours(settings.hours);
  const info = {
    ...cms.info,
    // Structured hours (when set) are the single source for the visible hours too.
    openingHours: structuredHours || (isPlaceholderHours(cms.info.openingHours) ? '' : cms.info.openingHours),
  };
  const servicePages = servicePageData.pages.filter((page) => isServicePageLive(page, cms));
  return {
    cms: { ...cms, info },
    info,
    settings,
    pageSeo: Object.fromEntries(pageSeoRows.map((row) => [row.path, mapPageSeo(row)])),
    servicePages,
    allServicePages: servicePageData.pages,
    articles,
  };
});

export function isPlaceholderHours(value) {
  return !value || /update with|final salon schedule|tbd|to be decided/i.test(String(value));
}

/* ------------------------------------------------------------------ metadata */

function titleCase(value) {
  return String(value || '').replace(/(^|\s)([a-z])/g, (match, space, letter) => `${space}${letter.toUpperCase()}`);
}

/** Default title/description per fixed public page. Unique, human, no keyword lists. */
export function staticPageDefaults(context) {
  const { info, settings } = context;
  const name = info.name;
  const descriptor = settings.businessDescriptor;
  const place = [settings.locality, settings.district].filter(Boolean).join(', ') || 'Birendranagar, Surkhet';
  const town = settings.district || settings.locality || 'Surkhet';
  return {
    '/': {
      label: 'Home',
      title: `${name} | ${titleCase(descriptor)} in ${place}`,
      description: `${name} is a ${descriptor.toLowerCase()} in ${info.address} offering haircuts, shaving, facials, hair colour and grooming packages. Book by WhatsApp or online.`,
    },
    '/services': {
      label: 'Services',
      title: `Services & Prices | ${name}, ${place}`,
      description: `Full price list at ${name}, ${info.address}: haircuts, shaving, facials and cleansing, hair colour, highlights, straightening and keratin.`,
    },
    '/packages': {
      label: 'Packages',
      title: `Grooming Packages & Prices | ${name}, ${town}`,
      description: `Grooming packages at ${name} in ${place} that combine a haircut, shave, cleansing or facial in one visit, with the price for each.`,
    },
    '/staff': {
      label: 'Team',
      title: `Meet the Team | ${name}, ${place}`,
      description: `The barbers and beautician at ${name}, ${info.address}, and the services each of them looks after.`,
    },
    '/gallery': {
      label: 'Gallery',
      title: `Salon Photos | ${name}, ${place}`,
      description: `Photos of ${name} in ${place}: the salon space, haircuts and services, hygiene setup and customers.`,
    },
    '/contact': {
      label: 'Contact',
      title: `Contact & Directions | ${name}, ${place}`,
      description: `Address, phone, WhatsApp, opening hours and map directions for ${name}, ${info.address}.`,
    },
    '/book-appointment': {
      label: 'Book Appointment',
      title: `Book an Appointment | ${name}, ${town}`,
      description: `Choose a service, stylist and time and send an appointment request to ${name}, ${place}.`,
    },
    '/reviews': {
      label: 'Reviews',
      title: `Customer Reviews | ${name}, ${place}`,
      description: `What customers say about their visits to ${name} in ${place}. Reviews are published only with the customer's permission.`,
    },
    '/guides': {
      label: 'Guides',
      title: `Hair & Grooming Guides | ${name}, ${town}`,
      description: `Practical hair care and grooming advice from the team at ${name}, ${place}.`,
    },
  };
}

function ogImageUrl(image, context) {
  return absoluteUrl(image || context.info.assets.ogImage || context.info.assets.banner);
}

/**
 * Next.js Metadata for a public page. `override` (from website_page_seo) wins field by field;
 * canonical is always an absolute URL on the canonical host.
 */
export function buildMetadata(context, { path, title, description, image, noindex = false, type = 'website', override = null, publishedTime, modifiedTime }) {
  const finalTitle = override?.seoTitle || title;
  const finalDescription = override?.metaDescription || description;
  const canonicalPath = normalizePath(override?.canonicalOverride) || path;
  const blockIndex = Boolean(noindex || override?.noindex);
  const images = [{ url: ogImageUrl(override?.ogImage || image, context), alt: context.info.name }];
  return {
    title: { absolute: finalTitle },
    description: finalDescription,
    alternates: { canonical: absoluteUrl(canonicalPath) },
    robots: blockIndex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type,
      url: absoluteUrl(canonicalPath),
      siteName: context.info.name,
      locale: 'en_US',
      title: override?.ogTitle || finalTitle,
      description: override?.ogDescription || finalDescription,
      images,
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: override?.ogTitle || finalTitle,
      description: override?.ogDescription || finalDescription,
      images: images.map((item) => item.url),
    },
  };
}

/** Metadata for one of the fixed public pages (/, /services, /contact, ...). */
export function staticPageMetadata(context, path, extra = {}) {
  const defaults = staticPageDefaults(context)[path];
  let { title, description } = defaults;
  // The homepage keeps honouring the title/description already set in Website CMS → SEO.
  if (path === '/') {
    title = context.cms.sections?.seo?.title || title;
    description = context.cms.sections?.seo?.description || description;
  }
  const metadata = buildMetadata(context, { path, title, description, override: context.pageSeo[path], ...extra });
  if (path === '/') {
    const verification = {};
    if (context.settings.gscVerification) verification.google = context.settings.gscVerification;
    if (context.settings.bingVerification) verification.other = { 'msvalidate.01': context.settings.bingVerification };
    if (Object.keys(verification).length) metadata.verification = verification;
    if (!context.pageSeo['/']?.ogTitle && context.cms.sections?.seo?.metadata?.ogTitle) metadata.openGraph.title = context.cms.sections.seo.metadata.ogTitle;
  }
  return metadata;
}

export function servicePageMetadata(context, page) {
  const town = context.settings.district || 'Surkhet';
  const locality = context.settings.locality || 'Birendranagar';
  return buildMetadata(context, {
    path: `/services/${page.slug}`,
    title: page.seoTitle || `${page.name} in ${town} | ${context.info.name}, ${locality}`,
    description: page.metaDescription || page.summary,
    image: page.ogImage || page.image,
    noindex: page.noindex,
    modifiedTime: page.updatedAt || undefined,
  });
}

export function articleMetadata(context, article) {
  return buildMetadata(context, {
    path: `/guides/${article.slug}`,
    title: article.seoTitle || `${article.title} | ${context.info.name}`,
    description: article.metaDescription || article.excerpt,
    image: article.coverImage,
    type: 'article',
    publishedTime: article.publishedAt || undefined,
    modifiedTime: article.updatedAt || undefined,
  });
}

/* ------------------------------------------------------------------ structured data */

function priceRange(context) {
  if (context.settings.priceRange) return context.settings.priceRange;
  const prices = (context.cms.services || []).map((service) => Number(service.price || 0)).filter((value) => value > 0);
  if (!prices.length) return undefined;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `Rs ${min}` : `Rs ${min}–${max}`;
}

function sameAs(context) {
  const { info, settings } = context;
  return [info.social?.facebook, info.social?.tiktok, settings.instagram, settings.youtube]
    .map((url) => safeHttpsUrl(url))
    .filter(Boolean)
    .map((url) => {
      // Share links carry tracking parameters (?_r=1&_t=…); the profile URL is the identity.
      // Facebook keeps its query because "profile.php?id=…" IS the profile.
      const parsed = new URL(url);
      if (!/facebook\.com$/i.test(parsed.hostname)) parsed.search = '';
      return parsed.toString();
    });
}

export function businessId() {
  return `${siteUrl()}/#business`;
}

/** The single LocalBusiness node. Only facts the owner has entered — no ratings, no invented data. */
export function localBusinessJsonLd(context) {
  const { info, settings } = context;
  const node = {
    '@context': 'https://schema.org',
    '@type': settings.businessType,
    '@id': businessId(),
    name: info.name,
    url: absoluteUrl('/'),
    logo: absoluteUrl(info.assets.logo),
    image: [absoluteUrl(info.assets.banner), absoluteUrl(info.assets.hero)].filter(Boolean),
    description: context.cms.sections?.seo?.description || staticPageDefaults(context)['/'].description,
    telephone: String(info.phone || '').replace(/\s+/g, ''),
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.streetAddress || info.address,
      addressLocality: settings.locality || undefined,
      addressRegion: settings.region || undefined,
      postalCode: settings.postalCode || undefined,
      addressCountry: settings.country,
    },
    areaServed: settings.district ? { '@type': 'AdministrativeArea', name: `${settings.district}, ${settings.region || 'Nepal'}` } : undefined,
    priceRange: priceRange(context),
    currenciesAccepted: 'NPR',
    sameAs: sameAs(context),
    hasMap: settings.googleMapsUrl || undefined,
  };
  if (settings.latitude && settings.longitude) {
    node.geo = { '@type': 'GeoCoordinates', latitude: Number(settings.latitude), longitude: Number(settings.longitude) };
  }
  const open = settings.hours.filter((row) => !row.closed && row.opens && row.closes);
  if (open.length) {
    node.openingHoursSpecification = open.map((row) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${row.day}`,
      opens: row.opens,
      closes: row.closes,
    }));
  }
  if (!node.sameAs.length) delete node.sameAs;
  return stripUndefined(node);
}

export function websiteJsonLd(context) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl()}/#website`,
    url: absoluteUrl('/'),
    name: context.info.name,
    publisher: { '@id': businessId() },
    inLanguage: 'en',
  };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export function serviceJsonLd(context, page, services) {
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: page.name,
    serviceType: page.name,
    description: page.summary,
    url: absoluteUrl(`/services/${page.slug}`),
    image: page.image ? absoluteUrl(page.image) : undefined,
    provider: { '@id': businessId() },
    areaServed: { '@type': 'Place', name: [context.settings.locality, context.settings.district].filter(Boolean).join(', ') || 'Surkhet' },
    hasOfferCatalog: services.some((service) => service.price > 0) ? {
      '@type': 'OfferCatalog',
      name: `${page.name} prices`,
      itemListElement: services.filter((service) => service.price > 0).map((service) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: service.name },
        price: service.price,
        priceCurrency: 'NPR',
      })),
    } : undefined,
  });
}

export function articleJsonLd(context, article) {
  return stripUndefined({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title.slice(0, 110),
    description: article.excerpt || undefined,
    image: article.coverImage ? [absoluteUrl(article.coverImage)] : undefined,
    datePublished: article.publishedAt || undefined,
    dateModified: article.updatedAt || article.publishedAt || undefined,
    author: article.author ? { '@type': 'Person', name: article.author } : { '@id': businessId() },
    publisher: { '@id': businessId() },
    mainEntityOfPage: absoluteUrl(`/guides/${article.slug}`),
  });
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, stripUndefined(v)]));
  }
  return value;
}

/* ------------------------------------------------------------------ redirects */

/** Looks up an active redirect for a missing public path and counts the hit. */
export async function findRedirect(path) {
  const from = normalizePath(path);
  if (!from) return null;
  try {
    const db = Database.getInstance();
    if (!(await tableExists(db, 'website_redirects'))) return null;
    const row = await db.get('SELECT id, to_path FROM website_redirects WHERE from_path = ? AND is_active = TRUE', [from]);
    if (!row) return null;
    await db.run('UPDATE website_redirects SET hits = hits + 1, last_hit_at = NOW() WHERE id = ?', [row.id]).catch(() => {});
    return row.to_path;
  } catch {
    return null;
  }
}

/**
 * Adds old → new and re-points every redirect that ended at `old`, so there are never chains.
 * Also removes a redirect whose source is the new live URL (the page came back).
 */
export async function addRedirect(db, { from, to, note = '', actorId = null }) {
  const source = normalizePath(from);
  const target = /^https:\/\//i.test(String(to || '')) ? String(to) : normalizePath(to);
  if (!source || !target) throw httpError('Both paths must be site paths like /services/haircut.');
  if (source === '/') throw httpError('The homepage cannot be redirected.');
  if (source === target) throw httpError('A page cannot redirect to itself.');
  // Order matters: drop the target's own redirect first (it is live again), otherwise re-pointing
  // would briefly create target → target and trip the from_path <> to_path check.
  await db.run('DELETE FROM website_redirects WHERE from_path = ?', [target]);
  await db.run('UPDATE website_redirects SET to_path = ? WHERE to_path = ?', [target, source]);
  await db.run(`
    INSERT INTO website_redirects (from_path, to_path, note, is_active, created_by)
    VALUES (?, ?, ?, TRUE, ?)
    ON CONFLICT (from_path) DO UPDATE SET to_path = EXCLUDED.to_path, note = EXCLUDED.note, is_active = TRUE
  `, [source, target, text(note, '', 200), actorId]);
}

export async function listRedirects(db) {
  if (!(await tableExists(db, 'website_redirects'))) return [];
  const rows = await db.all('SELECT * FROM website_redirects ORDER BY created_at DESC, id DESC');
  return rows.map((row) => ({
    id: Number(row.id), from: row.from_path, to: row.to_path, note: row.note || '', isActive: bool(row.is_active),
    hits: Number(row.hits || 0), lastHitAt: row.last_hit_at ? new Date(row.last_hit_at).toISOString() : null,
  }));
}

/* ------------------------------------------------------------------ admin writes */

export async function saveSeoSettings(db, actor, input) {
  await assertSeoSchema(db);
  const settings = normalizeSeoSettings(input);
  if (input.googleReviewUrl && !settings.googleReviewUrl) throw httpError('The Google review link must start with https://');
  if (input.gscVerification && !settings.gscVerification) throw httpError('The Search Console token does not look right. Paste the content="…" value or the whole meta tag.');
  if ((settings.latitude && !settings.longitude) || (!settings.latitude && settings.longitude)) throw httpError('Enter both latitude and longitude, or neither.');
  const hoursHalf = settings.hours.find((row) => !row.closed && Boolean(row.opens) !== Boolean(row.closes));
  if (hoursHalf) throw httpError(`${hoursHalf.day}: enter both opening and closing time, or mark it closed.`);
  await db.run('UPDATE website_seo_settings SET settings = ?::jsonb, updated_by = ?, updated_at = NOW() WHERE id = 1', [JSON.stringify(settings), actor.id]);
  return settings;
}

export async function savePageSeo(db, actor, input) {
  await assertSeoSchema(db);
  const path = normalizePath(input.path);
  if (!path) throw httpError('Unknown page.');
  const canonical = normalizePath(input.canonicalOverride);
  if (input.canonicalOverride && !canonical) throw httpError('Canonical override must be a path on this website, e.g. /services.');
  await db.run(`
    INSERT INTO website_page_seo (path, seo_title, meta_description, og_title, og_description, og_image, canonical_override, noindex, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON CONFLICT (path) DO UPDATE SET seo_title = EXCLUDED.seo_title, meta_description = EXCLUDED.meta_description,
      og_title = EXCLUDED.og_title, og_description = EXCLUDED.og_description, og_image = EXCLUDED.og_image,
      canonical_override = EXCLUDED.canonical_override, noindex = EXCLUDED.noindex, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `, [
    path,
    text(input.seoTitle, '', 120) || null,
    text(input.metaDescription, '', 320) || null,
    text(input.ogTitle, '', 120) || null,
    text(input.ogDescription, '', 320) || null,
    text(input.ogImage, '', 500) || null,
    canonical && canonical !== path ? canonical : null,
    Boolean(input.noindex),
    actor.id,
  ]);
}

function cleanFaqs(faqs) {
  return (Array.isArray(faqs) ? faqs : []).slice(0, 12).map((row) => ({
    question: text(row?.question, '', 200),
    answer: text(row?.answer, '', 1200),
  })).filter((row) => row.question && row.answer);
}

function cleanSlug(value, label) {
  const slug = slugify(value);
  if (!slug) throw httpError(`${label} needs a URL slug (letters, numbers and dashes).`);
  return slug;
}

/** Copies the default service pages into the table the first time the owner edits one. */
async function ensureServicePagesStored(tx, actor) {
  const count = await tx.get('SELECT COUNT(*)::int AS count FROM website_service_pages');
  if (Number(count?.count || 0) > 0) return;
  for (const page of DEFAULT_SERVICE_PAGES) {
    await tx.run(`
      INSERT INTO website_service_pages (slug, name, heading, summary, body, suitable_for, service_names, faqs, related_slugs,
        image_url, image_alt, status, seo_title, sort_order, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?)
    `, [page.slug, page.name, page.heading, page.summary, page.body, page.suitableFor, page.serviceNames.join(','), '[]',
      page.related.join(','), page.image || null, page.imageAlt || null, page.status, page.seoTitle || null, page.sortOrder, actor.id]);
  }
}

export async function saveServicePage(db, actor, input) {
  await assertSeoSchema(db);
  const name = text(input.name, '', 80);
  if (!name) throw httpError('Service page name is required.');
  const slug = cleanSlug(input.slug, 'The service page');
  const status = PAGE_STATUSES.includes(input.status) ? input.status : 'DRAFT';
  const values = [
    slug, name, text(input.heading, name, 120) || name, text(input.summary, '', 400), text(input.body, '', 8000),
    text(input.suitableFor, '', 400), (Array.isArray(input.serviceNames) ? input.serviceNames : []).map((value) => text(value, '', 80)).filter(Boolean).join(','),
    JSON.stringify(cleanFaqs(input.faqs)),
    (Array.isArray(input.related) ? input.related : []).map((value) => slugify(value)).filter(Boolean).join(','),
    text(input.image, '', 500) || null, text(input.imageAlt, '', 200) || null, status,
    text(input.seoTitle, '', 120) || null, text(input.metaDescription, '', 320) || null, text(input.ogImage, '', 500) || null,
    Boolean(input.noindex), Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0, actor.id,
  ];
  return db.transaction(async (tx) => {
    await ensureServicePagesStored(tx, actor);
    const clash = await tx.get('SELECT id FROM website_service_pages WHERE slug = ?', [slug]);
    let id = Number(input.id || 0);
    if (!id && input.originalSlug) {
      const byOriginal = await tx.get('SELECT id FROM website_service_pages WHERE slug = ?', [slugify(input.originalSlug)]);
      id = Number(byOriginal?.id || 0);
    }
    if (clash && Number(clash.id) !== id) throw httpError(`Another service page already uses /services/${slug}.`);
    if (id) {
      const existing = await tx.get('SELECT slug FROM website_service_pages WHERE id = ?', [id]);
      if (!existing) throw httpError('Service page not found.', 404);
      await tx.run(`
        UPDATE website_service_pages SET slug = ?, name = ?, heading = ?, summary = ?, body = ?, suitable_for = ?, service_names = ?,
          faqs = ?::jsonb, related_slugs = ?, image_url = ?, image_alt = ?, status = ?, seo_title = ?, meta_description = ?, og_image = ?,
          noindex = ?, sort_order = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ?
      `, [...values, id]);
      // Slug stability: an edited URL keeps working through a permanent redirect.
      if (existing.slug !== slug) await addRedirect(tx, { from: `/services/${existing.slug}`, to: `/services/${slug}`, note: 'Service page URL changed', actorId: actor.id });
    } else {
      await tx.run(`
        INSERT INTO website_service_pages (slug, name, heading, summary, body, suitable_for, service_names, faqs, related_slugs,
          image_url, image_alt, status, seo_title, meta_description, og_image, noindex, sort_order, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, values);
    }
    await tx.run('DELETE FROM website_redirects WHERE from_path = ?', [`/services/${slug}`]);
  });
}

export async function saveArticle(db, actor, input) {
  await assertSeoSchema(db);
  const title = text(input.title, '', 160);
  if (!title) throw httpError('Guide title is required.');
  const slug = cleanSlug(input.slug || title, 'The guide');
  const status = PAGE_STATUSES.includes(input.status) ? input.status : 'DRAFT';
  const body = text(input.body, '', 30000);
  if (status === 'PUBLISHED' && body.split(/\s+/).filter(Boolean).length < 150) {
    throw httpError('A published guide needs at least 150 words of real advice. Save it as a draft until it is ready.');
  }
  return db.transaction(async (tx) => {
    const clash = await tx.get('SELECT id FROM website_articles WHERE slug = ?', [slug]);
    const id = Number(input.id || 0);
    if (clash && Number(clash.id) !== id) throw httpError(`Another guide already uses /guides/${slug}.`);
    const values = [
      slug, title, text(input.excerpt, '', 400), text(input.coverImage, '', 500) || null, text(input.coverAlt, '', 200) || null, body,
      text(input.author, '', 80), slugify(input.relatedServiceSlug) || null, text(input.seoTitle, '', 120) || null,
      text(input.metaDescription, '', 320) || null, status, actor.id,
    ];
    if (id) {
      const existing = await tx.get('SELECT slug, published_at FROM website_articles WHERE id = ?', [id]);
      if (!existing) throw httpError('Guide not found.', 404);
      await tx.run(`
        UPDATE website_articles SET slug = ?, title = ?, excerpt = ?, cover_image = ?, cover_alt = ?, body = ?, author = ?,
          related_service_slug = ?, seo_title = ?, meta_description = ?, status = ?, updated_by = ?, updated_at = NOW(),
          published_at = CASE WHEN ? = 'PUBLISHED' AND published_at IS NULL THEN NOW() ELSE published_at END
        WHERE id = ?
      `, [...values, status, id]);
      if (existing.slug !== slug && existing.published_at) await addRedirect(tx, { from: `/guides/${existing.slug}`, to: `/guides/${slug}`, note: 'Guide URL changed', actorId: actor.id });
    } else {
      await tx.run(`
        INSERT INTO website_articles (slug, title, excerpt, cover_image, cover_alt, body, author, related_service_slug, seo_title,
          meta_description, status, updated_by, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'PUBLISHED' THEN NOW() ELSE NULL END)
      `, [...values, status]);
    }
    await tx.run('DELETE FROM website_redirects WHERE from_path = ?', [`/guides/${slug}`]);
  });
}
