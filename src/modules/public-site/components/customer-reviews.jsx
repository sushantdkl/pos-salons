import Link from 'next/link';
import Database from '@/lib/db/index';
import { publishedReviews } from '@/lib/reviews/service';
import { Section } from './section';

/**
 * "What our clients say" — PUBLISHED reviews the customer agreed to show, and nothing else:
 * first name, rating, review, date, service. Hidden when there are none (or the owner turned
 * website reviews off). A database hiccup hides the section instead of breaking the page.
 */
export async function CustomerReviews() {
  let reviews = [];
  try {
    reviews = await publishedReviews(Database.getInstance(), { limit: 6 });
  } catch {
    reviews = [];
  }
  if (!reviews.length) return null;
  return (
    <Section eyebrow="Reviews" title="What our clients say" description="Real feedback from verified visits and guests of The Hair Cut.">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review, index) => (
          <figure key={`${review.date}-${index}`} className="flex h-full flex-col border border-[#e7ded2] bg-white p-6">
            {review.rating ? <p className="text-lg tracking-widest text-[#c39e2e]" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}<span className="text-[#e7ded2]">{'★'.repeat(5 - review.rating)}</span></p> : null}
            {review.text ? <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-[#3b342f]">“{review.text}”</blockquote> : <div className="flex-1" />}
            <figcaption className="mt-4 text-xs uppercase tracking-wider text-[#6d625b]">
              {review.name}{review.service ? ` · ${review.service}` : ''} · {new Date(`${review.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' })}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-8 text-center text-sm"><Link href="/review" className="font-semibold text-[#8a6727] underline-offset-4 hover:underline">Visited us? Leave a review</Link></p>
    </Section>
  );
}
