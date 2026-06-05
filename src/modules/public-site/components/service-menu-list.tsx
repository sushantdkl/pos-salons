import { ServiceCard } from './cards';
import type { PublicService } from '../types';

const categoryOrder = ['Hair', 'Beard', 'Beauty', 'Treatment', 'Package'] as const;

function groupServicesByCategory(services: PublicService[]) {
  const grouped = new Map<string, PublicService[]>();

  for (const service of services) {
    const category = service.category || 'Other';
    const items = grouped.get(category) ?? [];
    items.push(service);
    grouped.set(category, items);
  }

  const ordered: Array<[string, PublicService[]]> = [];

  for (const category of categoryOrder) {
    const items = grouped.get(category);
    if (items?.length) {
      ordered.push([category, items]);
      grouped.delete(category);
    }
  }

  for (const [category, items] of grouped.entries()) {
    ordered.push([category, items]);
  }

  return ordered;
}

export function ServiceMenuList({ services }: { services: PublicService[] }) {
  const groups = groupServicesByCategory(services);

  return (
    <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3 xl:gap-x-10">
      {groups.map(([category, items]) => (
        <div key={category} className="rounded-sm border border-[#e7ded2] bg-white p-5 md:p-6">
          <h3 className="border-b border-[#e7ded2] pb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9b742d]">
            {category}
          </h3>
          <div className="mt-1">
            {items.map((service) => (
              <ServiceCard key={service.name} service={service} variant="menu" compact hideCategory tone="light" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
