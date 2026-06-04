import { SERVICE_CATEGORIES } from '@/constants/salon';
import { sanitizeText } from '@/utils/sanitize';
import { normalizeServiceInput } from './validation';
import { ServiceRepository } from './repository';
import { logAction } from '@/lib/db/helpers';

export class ServiceManagementService {
  constructor(db) {
    this.repository = new ServiceRepository(db);
    this.db = db;
  }

  async list(filters) {
    return {
      services: await this.repository.list({
        search: sanitizeText(filters.search),
        category: sanitizeText(filters.category),
      }),
      categories: SERVICE_CATEGORIES,
    };
  }

  async create(data, userId) {
    const service = await this.repository.create(normalizeServiceInput(data));
    await this.log(userId, 'create', service.id, service.name);
    return service;
  }

  async update(data, userId) {
    if (!data.id) throw new Error('Service ID is required');
    const service = await this.repository.update(normalizeServiceInput(data));
    await this.log(userId, 'update', service.id, service.name);
    return service;
  }

  async delete(id, userId) {
    if (!id) throw new Error('Service ID is required');
    await this.repository.remove(id);
    await this.log(userId, 'delete', id, 'Service deleted');
  }

  async log(userId, action, entityId, details) {
    await logAction(this.db, userId, action, 'service', entityId, details);
  }
}
