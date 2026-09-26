import Link from 'next/link';
import { JsonLd } from './json-ld';
import { breadcrumbJsonLd } from '../services/seo';

export type Crumb = { name: string; href: string };

/** Visible breadcrumb trail plus the matching BreadcrumbList. The last crumb is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const trail = [{ name: 'Home', href: '/' }, ...items];
  return (
    <>
      <JsonLd data={breadcrumbJsonLd(trail)} />
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6d625b]">
          {trail.map((item, index) => {
            const last = index === trail.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-2">
                {last ? (
                  <span aria-current="page" className="font-semibold text-[#171411]">{item.name}</span>
                ) : (
                  <Link href={item.href} className="underline-offset-4 hover:text-[#171411] hover:underline">{item.name}</Link>
                )}
                {last ? null : <span aria-hidden="true" className="text-[#c8b89f]">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
