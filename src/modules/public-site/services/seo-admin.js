/**
 * Admin view of SEO & Local Search: everything the panel shows, plus the safety checks.
 * Checks WARN — they never block publishing except where saving would be unsafe (handled in seo.js).
 */
import Database from '@/lib/db/index';
import { publishedReviews } from '@/lib/reviews/service';
import { absoluteUrl, siteUrl, DEFAULT_SITE_URL, normalizePath } from '@/lib/seo/site';
import {
  GBP_CHECKLIST, assertSeoSchema, getSiteContext, hoursConfigured, isPlaceholderHours, isServicePageLive, listRedirects,
  matchServices, readArticles, servicePageMetadata, articleMetadata, staticPageDefaults, staticPageMetadata,
} from './seo';

const FIXED_PATHS = ['/', '/services', '/packages', '/staff', '/gallery', '/contact', '/book-appointment', '/reviews', '/guides'];

function titleOf(metadata) {
  return typeof metadata.title === 'string' ? metadata.title : metadata.title?.absolute || '';
}

async function schemaReady(db) {
  try {
    await assertSeoSchema(db);
    return true;
  } catch {
    return false;
  }
}

export async function loadSeoAdmin() {
  const db = Database.getInstance();
  const ready = await schemaReady(db);
  const context = await getSiteContext();
  const allArticles = ready ? await readArticles(db, { publishedOnly: false }) : [];
  const redirects = ready ? await listRedirects(db) : [];
  let reviewCount = 0;
  try {
    reviewCount = (await publishedReviews(db, { limit: 50 })).length;
  } catch {
    reviewCount = 0;
  }

  const defaults = staticPageDefaults(context);
  const pages = FIXED_PATHS.map((path) => {
    const live = path === '/reviews' ? reviewCount > 0 : path === '/guides' ? context.articles.length > 0 : true;
    const metadata = staticPageMetadata(context, path);
    return {
      path,
      label: defaults[path].label,
      live,
      liveNote: live ? '' : path === '/reviews' ? 'Appears once a customer review is published.' : 'Appears once a guide is published.',
      defaults: { title: path === '/' ? context.cms.sections?.seo?.title || defaults[path].title : defaults[path].title, description: path === '/' ? context.cms.sections?.seo?.description || defaults[path].description : defaults[path].description },
      override: context.pageSeo[path] || null,
      effective: { title: titleOf(metadata), description: metadata.description, canonical: metadata.alternates.canonical, noindex: metadata.robots.index === false },
    };
  });

  const servicePages = context.allServicePages.map((page) => {
    const { services, packages } = matchServices(page, context.cms);
    const metadata = servicePageMetadata(context, page);
    return {
      ...page,
      live: isServicePageLive(page, context.cms),
      matchedServices: services.map((service) => service.name),
      matchedPackages: packages.map((item) => item.name),
      effective: { title: titleOf(metadata), description: metadata.description, canonical: metadata.alternates.canonical },
    };
  });

  const articles = allArticles.map((article) => {
    const metadata = articleMetadata(context, article);
    return { ...article, effective: { title: titleOf(metadata), description: metadata.description, canonical: metadata.alternates.canonical } };
  });

  const sitemap = [
    ...pages.filter((page) => page.live && !page.effective.noindex && page.effective.canonical === absoluteUrl(page.path)).map((page) => absoluteUrl(page.path)),
    ...servicePages.filter((page) => page.live && !page.noindex).map((page) => absoluteUrl(`/services/${page.slug}`)),
    ...articles.filter((article) => article.status === 'PUBLISHED').map((article) => absoluteUrl(`/guides/${article.slug}`)),
  ];

  const nap = {
    name: context.info.name,
    address: context.info.address,
    phone: context.info.phone,
    whatsapp: context.info.whatsappNumber,
    openingHours: context.info.openingHours,
    facebook: context.info.social?.facebook || '',
    tiktok: context.info.social?.tiktok || '',
    mapEmbedUrl: context.info.mapEmbedUrl,
  };

  return {
    schemaReady: ready,
    siteUrl: siteUrl(),
    settings: context.settings,
    nap,
    availableServices: [...(context.cms.services || []), ...(context.cms.packages || [])].map((service) => service.name),
    pages,
    servicePages,
    articles,
    redirects,
    sitemap,
    gbpChecklist: GBP_CHECKLIST.map(([key, label, hint]) => ({ key, label, hint })),
    audit: runAudit({ ready, context, pages, servicePages, articles, redirects, rawHours: context.cms.info?.openingHours }),
  };
}

function lengthChecks(checks, where, title, description) {
  if (!title) checks.push({ level: 'error', area: where, message: 'Missing title.' });
  else if (title.length < 30) checks.push({ level: 'warning', area: where, message: `Title is short (${title.length} characters). Aim for 30–65.` });
  else if (title.length > 65) checks.push({ level: 'warning', area: where, message: `Title is long (${title.length} characters) and may be cut off in Google. Aim for 30–65.` });
  if (!description) checks.push({ level: 'error', area: where, message: 'Missing meta description.' });
  else if (description.length < 70) checks.push({ level: 'warning', area: where, message: `Meta description is short (${description.length} characters). Aim for 70–160.` });
  else if (description.length > 165) checks.push({ level: 'warning', area: where, message: `Meta description is long (${description.length} characters). Aim for 70–160.` });
}

function runAudit({ ready, context, pages, servicePages, articles, redirects }) {
  const checks = [];
  const { settings, info, cms } = context;

  if (!ready) checks.push({ level: 'error', area: 'Database', message: 'SEO tables are not installed. Run `npm run db:migrate`; until then defaults are used and nothing can be saved.' });
  if (siteUrl() !== DEFAULT_SITE_URL) checks.push({ level: 'warning', area: 'Canonical domain', message: `Canonical site URL is ${siteUrl()} (SITE_CANONICAL_URL). Expected ${DEFAULT_SITE_URL}.` });

  // Local business facts
  if (!hoursConfigured(settings.hours)) {
    checks.push({ level: 'warning', area: 'Local business', message: isPlaceholderHours(cms.sections?.contact?.metadata?.openingHours) ? 'Opening hours are still the placeholder text, so the website shows "call to confirm". Enter real hours in Local Business.' : 'Enter structured opening hours in Local Business so Google gets them in structured data.' });
  }
  if (!settings.latitude || !settings.longitude) checks.push({ level: 'warning', area: 'Local business', message: 'Map coordinates are not set. Copy them from the salon\'s Google Maps pin (see Local Business).' });
  if (!settings.googleReviewUrl) checks.push({ level: 'info', area: 'Reviews', message: 'Add your Google review link so the Review & Rewards page can offer it to every customer.' });
  if (!settings.gscVerification) checks.push({ level: 'warning', area: 'Search Console', message: 'Search Console is not verified yet. Prefer DNS verification; or paste the HTML-tag token.' });
  if (settings.locality && !String(info.address).toLowerCase().includes(settings.locality.toLowerCase())) {
    checks.push({ level: 'warning', area: 'NAP consistency', message: `Contact address "${info.address}" does not mention "${settings.locality}". Keep the address the same everywhere.` });
  }
  if (!/^\+977/.test(String(info.phone || '').trim())) {
    checks.push({ level: 'info', area: 'NAP consistency', message: `Phone "${info.phone}" — use the international form (+977 98…) everywhere, including Google Business Profile.` });
  }

  // Homepage H1 comes from the hero.
  if (!cms.sections?.hero?.isVisible) checks.push({ level: 'error', area: 'Home', message: 'The hero section is hidden, so the homepage has no H1 heading. Turn the hero back on in Website CMS.' });

  // Titles / descriptions (live pages only), duplicates across the whole site.
  const livePages = [
    ...pages.filter((page) => page.live).map((page) => ({ where: page.label, ...page.effective })),
    ...servicePages.filter((page) => page.live).map((page) => ({ where: `Service: ${page.name}`, ...page.effective })),
    ...articles.filter((article) => article.status === 'PUBLISHED').map((article) => ({ where: `Guide: ${article.title}`, ...article.effective })),
  ];
  livePages.forEach((page) => lengthChecks(checks, page.where, page.title, page.description));
  const dupes = (key) => {
    const seen = new Map();
    livePages.forEach((page) => {
      const value = String(page[key] || '').trim().toLowerCase();
      if (value) seen.set(value, [...(seen.get(value) || []), page.where]);
    });
    [...seen.values()].filter((list) => list.length > 1).forEach((list) => checks.push({ level: 'error', area: 'Duplicates', message: `Same ${key} on: ${list.join(', ')}.` }));
  };
  dupes('title');
  dupes('description');

  pages.filter((page) => page.effective.noindex).forEach((page) => checks.push({ level: 'info', area: page.label, message: 'Set to noindex — it is kept out of Google and out of the sitemap.' }));

  // Canonical overrides must point at a live public page.
  const livePaths = new Set([
    ...pages.filter((page) => page.live).map((page) => page.path),
    ...servicePages.filter((page) => page.live).map((page) => `/services/${page.slug}`),
    ...articles.filter((article) => article.status === 'PUBLISHED').map((article) => `/guides/${article.slug}`),
    '/review', '/book',
  ]);
  pages.forEach((page) => {
    const target = page.override?.canonicalOverride;
    if (target && !livePaths.has(target)) checks.push({ level: 'error', area: page.label, message: `Canonical points to ${target}, which is not a live page.` });
  });

  // Service pages
  servicePages.forEach((page) => {
    if (page.status === 'PUBLISHED' && !page.matchedServices.length) {
      checks.push({ level: 'warning', area: `Service: ${page.name}`, message: 'Published but hidden — none of its services are on the live price list. Link it to real services or set it to Draft.' });
    }
    if (page.live && page.body.split(/\s+/).filter(Boolean).length < 60) checks.push({ level: 'warning', area: `Service: ${page.name}`, message: 'Very little text. Add real detail: what happens, how long it takes, aftercare.' });
    if (page.image && !page.imageAlt) checks.push({ level: 'warning', area: `Service: ${page.name}`, message: 'Photo has no alt text — it will not be shown until you describe it.' });
    page.related.filter((slug) => !servicePages.some((item) => item.slug === slug && item.live)).forEach((slug) => {
      checks.push({ level: 'info', area: `Service: ${page.name}`, message: `Related link "${slug}" is not a live service page, so it is skipped.` });
    });
  });

  // Images
  const genericAlt = (cms.gallery || []).filter((item) => !item.altText || /^salon photo$/i.test(item.altText) || /^img[_-]?\d+/i.test(item.altText));
  if (genericAlt.length) checks.push({ level: 'warning', area: 'Images', message: `${genericAlt.length} gallery photo(s) have missing or generic alt text. Describe each photo (e.g. "Men's fade haircut at The Hair Cut, Birendranagar").` });
  const unnamed = (cms.gallery || []).filter((item) => /\/(img|dsc|image|photo)[_-]?\d+/i.test(String(item.image || '')));
  if (unnamed.length) checks.push({ level: 'info', area: 'Images', message: `${unnamed.length} photo file name(s) look like camera names (IMG_1234). Descriptive names help image search.` });

  // CMS button links that go nowhere
  const internal = (link) => link && link.startsWith('/') ? normalizePath(link) : '';
  ['hero', 'about', 'contact'].forEach((key) => {
    const section = cms.sections?.[key];
    [section?.buttonLink, section?.secondaryButtonLink].map(internal).filter(Boolean).forEach((path) => {
      if (!livePaths.has(path)) checks.push({ level: 'error', area: 'Broken links', message: `Website CMS ${key} button links to ${path}, which is not a live page.` });
    });
  });

  // Redirects
  const sources = new Set(redirects.filter((row) => row.isActive).map((row) => row.from));
  redirects.filter((row) => row.isActive).forEach((row) => {
    if (sources.has(row.to)) checks.push({ level: 'error', area: 'Redirects', message: `Redirect chain: ${row.from} → ${row.to} → … Point ${row.from} straight to the final page.` });
    else if (row.to.startsWith('/') && !livePaths.has(row.to)) checks.push({ level: 'warning', area: 'Redirects', message: `${row.from} redirects to ${row.to}, which is not a live page.` });
    if (livePaths.has(row.from)) checks.push({ level: 'warning', area: 'Redirects', message: `${row.from} is a live page, so its redirect is never used.` });
  });

  if (!checks.some((check) => check.level !== 'info')) checks.unshift({ level: 'ok', area: 'Overall', message: 'No errors or warnings.' });
  return checks;
}
