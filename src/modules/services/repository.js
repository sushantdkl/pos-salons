export class ServiceRepository {
  constructor(db) {
    this.db = db;
  }

  async list({ search = '', category = '' } = {}) {
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ' AND (s.name ILIKE ? OR s.description ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category && category !== 'all') {
      where += ' AND s.category = ?';
      params.push(category);
    }

    const sql = `
      SELECT s.*
      FROM salon_services s
      ${where}
      ORDER BY s.is_active DESC, s.name ASC
    `;
    return await this.db.all(sql, params);
  }

  async findById(id) {
    return await this.db.get('SELECT * FROM salon_services WHERE id = ?', [id]);
  }

  async create(service) {
    const result = await this.db.run(`
      INSERT INTO salon_services (name, category, price, duration_minutes, assigned_staff_ids, description, is_active, is_package, package_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      service.name,
      service.category,
      service.price,
      service.duration_minutes,
      service.assigned_staff_ids,
      service.description,
      service.is_active,
      service.is_package,
      service.package_items
    ]);

    return await this.findById(result.lastInsertRowid);
  }

  async update(service) {
    await this.db.run(`
      UPDATE salon_services
      SET name = ?, category = ?, price = ?, duration_minutes = ?, assigned_staff_ids = ?,
          description = ?, is_active = ?, is_package = ?, package_items = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      service.name,
      service.category,
      service.price,
      service.duration_minutes,
      service.assigned_staff_ids,
      service.description,
      service.is_active,
      service.is_package,
      service.package_items,
      service.id
    ]);

    return await this.findById(service.id);
  }

  /**
   * A service that was ever billed, tokened, booked, reviewed or used by a loyalty program keeps
   * its history: it is archived (made inactive, so it can no longer be billed or booked) instead
   * of erased. Only a never-used service is really deleted. Returns { archived }.
   */
  async remove(id) {
    const usage = await this.db.get(`
      SELECT EXISTS (SELECT 1 FROM salon_bill_items WHERE item_type <> 'product' AND item_id = ?)
          OR EXISTS (SELECT 1 FROM walk_in_tokens WHERE service_id = ?)
          OR EXISTS (SELECT 1 FROM appointment_services WHERE service_id = ?)
          OR EXISTS (SELECT 1 FROM appointment_waitlist WHERE service_id = ?)
          OR EXISTS (SELECT 1 FROM loyalty_programs WHERE reward_service_id = ? OR ?::bigint = ANY(eligible_service_ids))
          OR EXISTS (SELECT 1 FROM customer_reviews WHERE service_id = ?) AS used
    `, [id, id, id, id, id, id, id]);
    if (usage?.used) {
      await this.db.run('UPDATE salon_services SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
      return { archived: true };
    }
    await this.db.run('DELETE FROM salon_services WHERE id = ?', [id]);
    return { archived: false };
  }
}
