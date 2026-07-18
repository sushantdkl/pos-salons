import Link from 'next/link';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { PageHero } from '@/modules/public-site/components/page-hero';
import { Section } from '@/modules/public-site/components/section';
import { CmsImage } from '@/modules/public-site/components/cms-image';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import type { GalleryItem } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const cms = await getPublicWebsiteData();
  return { title: `Gallery | ${cms.info.name}`, description: 'Photos from the salon space, services, opening moments, customers, and hygiene setup.' };
}

export default async function GalleryPage() {
  const cms = await getPublicWebsiteData();
  return (
    <PublicLayout info={cms.info}>
      <PageHero
        eyebrow="Gallery"
        title="Salon gallery"
        description="Real moments from The Hair Cut, including the salon space, services, opening day, customers, and hygiene setup."
        imageUrl={cms.info.assets.banner}
      />
      <Section hideHeader className="!py-10 md:!py-14">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cms.gallery.map((item: GalleryItem) => (
            <article
              key={`${item.id || item.title}-${item.image}`}
              className="group overflow-hidden border border-[#e7ded2] bg-white transition-shadow duration-300 hover:shadow-md"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#f8f3ed]">
                <CmsImage
                  src={item.image}
                  alt={item.altText || item.title}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <div className="p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b742d]">
                  {item.category || 'Salon'}
                </p>
                <h3 className="mt-2 font-serif text-xl font-light text-[#171411]">{item.title}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-[#6d625b]">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-10">
          <Link
            href="/book-appointment"
            className="inline-flex items-center justify-center border border-[#171411] bg-[#171411] px-8 py-4 text-xs font-bold uppercase tracking-wider text-white transition-colors duration-300 hover:bg-[#332920]"
          >
            Book a visit
          </Link>
        </div>
      </Section>
    </PublicLayout>
  );
}
