import { SERVICE_CATEGORIES } from '@/constants/salon';
import { sanitizeText } from '@/utils/sanitize';
import { normalizeServiceInput } from './validation';
import { ServiceRepository } from './repository';

export class ServiceManagementService {
  constructor(db) {
    this.repository = new ServiceRepository(db);
    this.db = db;
  }

  list(filters) {
    return {
      services: this.repository.list({
        search: sanitizeText(filters.search),
        category: sanitizeText(filters.category),
      }),
      categories: SERVICE_CATEGORIES,
    };
  }

  create(data, userId) {
    const service = this.repository.create(normalizeServiceInput(data));
    this.log(userId, 'create', service.id, service.name);
    return service;
  }

  update(data, userId) {
    if (!data.id) throw new Error('Service ID is required');
    const service = this.repository.update(normalizeServiceInput(data));
    this.log(userId, 'update', service.id, service.name);
    return service;
  }

  delete(id, userId) {
    if (!id) throw new Error('Service ID is required');
    this.repository.remove(id);
    this.log(userId, 'delete', id, 'Service deleted');
  }

  log(userId, action, entityId, details) {
    this.db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(userId, action, 'service', entityId, details);
  }
}
