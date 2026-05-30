import { SERVICE_CATEGORIES } from '@/constants/salon';
import { sanitizeText, toPositiveInteger, toPositiveNumber } from '@/utils/sanitize';

export function normalizeServiceInput(data) {
  const name = sanitizeText(data.name);
  const category = sanitizeText(data.category);
  const price = toPositiveNumber(data.price, 'Price');
  const duration = toPositiveInteger(data.duration_minutes || data.duration, 'Duration');

  if (!name) throw new Error('Service name is required');
  if (!SERVICE_CATEGORIES.includes(category)) throw new Error('Valid service category is required');

  const staffIds = Array.isArray(data.assigned_staff_ids)
    ? data.assigned_staff_ids.map(Number).filter(Boolean).join(',')
    : sanitizeText(data.assigned_staff_ids || '');

  return {
    id: data.id ? Number(data.id) : undefined,
    name,
    category,
    price,
    duration_minutes: duration,
    assigned_staff_ids: staffIds,
    description: sanitizeText(data.description, null),
    is_active: data.is_active === false ? 0 : 1,
  };
}
