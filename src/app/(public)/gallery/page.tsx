import Image from 'next/image';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { getPublicWebsiteData } from '@/modules/public-site/services/cms';
import type { GalleryItem } from '@/modules/public-site/types';

export const dynamic = 'force-dynamic';

export function generateMetadata() {
  const cms = getPublicWebsiteData();
  return { title: `Gallery | ${cms.info.name}`, description: 'Photos from the salon space, services, opening moments, customers, and hygiene setup.' };
}

export default function GalleryPage() {
  const cms = getPublicWebsiteData();
  return (
    <PublicLayout info={cms.info}>
      <Section eyebrow="Gallery" title="Salon gallery" description="Real moments from The Hair Cut, including the salon space, services, opening day, customers, and hygiene setup.">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cms.gallery.map((item: GalleryItem) => (
            <article key={item.title} className="overflow-hidden rounded-2xl border border-[#e7ded2] bg-white shadow-sm">
              <div className="relative aspect-[4/3] bg-[#171411]">
                <Image src={item.image} alt={item.altText || item.title} fill sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
              </div>
              <div className="p-5">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6d625b]">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>
    </PublicLayout>
  );
}
