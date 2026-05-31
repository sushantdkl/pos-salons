import { ImageIcon } from 'lucide-react';
import { PublicLayout } from '@/modules/public-site/components/public-layout';
import { Section } from '@/modules/public-site/components/section';
import { galleryItems } from '@/modules/public-site/data/gallery';

export const metadata = {
  title: 'Gallery | The Haircut Salon',
  description: 'Placeholder gallery for future salon photos and completed looks.',
};

export default function GalleryPage() {
  return (
    <PublicLayout>
      <Section eyebrow="Gallery" title="Salon gallery" description="Placeholder cards are ready for real salon images.">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {galleryItems.map((item) => (
            <article key={item.title} className="overflow-hidden rounded-2xl border border-[#e7ded2] bg-white shadow-sm">
              <div className="flex aspect-[4/3] items-center justify-center bg-[#211d1a] text-white">
                <ImageIcon className="h-10 w-10" />
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
