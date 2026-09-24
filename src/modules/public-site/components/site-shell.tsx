import type { ReactNode } from 'react';
import { PublicLayout } from './public-layout';
import { JsonLd } from './json-ld';
import { getSiteContext, localBusinessJsonLd, websiteJsonLd } from '../services/seo';
import { publishedReviews } from '@/lib/reviews/service';
import Database from '@/lib/db/index';
import type { ServicePage } from '../types';

/** Google Maps directions to the salon: the owner's Maps link when set, otherwise coordinates or name + address. */
export function directionsUrl(context: Awaited<ReturnType<typeof getSiteContext>>) {
  const { settings, info } = context;
  if (settings.googleMapsUrl) return settings.googleMapsUrl;
  const destination = settings.latitude && settings.longitude ? `${settings.latitude},${settings.longitude}` : `${info.name}, ${info.address}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export async function hasPublishedReviews() {
  try {
    return (await publishedReviews(Database.getInstance(), { limit: 1 })).length > 0;
  } catch {
    return false;
  }
}

/**
 * Server wrapper for every public page: the shared header/footer plus the one sitewide
 * LocalBusiness + WebSite JSON-LD, built from the same NAP data the footer shows.
 */
export async function SiteShell({ children, isHome = false }: { children: ReactNode; isHome?: boolean }) {
  const context = await getSiteContext();
  const showReviews = await hasPublishedReviews();
  return (
    <PublicLayout
      info={context.info}
      isHome={isHome}
      servicePages={context.servicePages.map((page: ServicePage) => ({ slug: page.slug, name: page.name }))}
      showGuides={context.articles.length > 0}
      showReviews={showReviews}
      directionsUrl={directionsUrl(context)}
    >
      <JsonLd data={[localBusinessJsonLd(context), websiteJsonLd(context)]} />
      {children}
    </PublicLayout>
  );
}
