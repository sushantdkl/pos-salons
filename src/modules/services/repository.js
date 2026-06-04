export class ServiceRepository {
  constructor(db) {
    this.db = db;
  }

  async list({ search = '', category = '' } = {}) {
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      where += ' AND (s.name LIKE ? OR s.description LIKE ?)';
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

  async remove(id) {
    return await this.db.run('DELETE FROM salon_services WHERE id = ?', [id]);
  }
}
