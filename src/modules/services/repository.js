export class ServiceRepository {
  constructor(db) {
    this.db = db;
  }

  list({ search = '', category = '' } = {}) {
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

    return this.db.prepare(`
      SELECT s.*, COALESCE(GROUP_CONCAT(u.full_name, ', '), '') as assigned_staff_names
      FROM salon_services s
      LEFT JOIN users u ON instr(',' || COALESCE(s.assigned_staff_ids, '') || ',', ',' || u.id || ',') > 0
      ${where}
      GROUP BY s.id
      ORDER BY s.is_active DESC, s.name ASC
    `).all(...params);
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM salon_services WHERE id = ?').get(id);
  }

  create(service) {
    const result = this.db.prepare(`
      INSERT INTO salon_services (name, category, price, duration_minutes, assigned_staff_ids, description, is_active, is_package, package_items)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      service.name,
      service.category,
      service.price,
      service.duration_minutes,
      service.assigned_staff_ids,
      service.description,
      service.is_active,
      service.is_package,
      service.package_items
    );

    return this.findById(result.lastInsertRowid);
  }

  update(service) {
    this.db.prepare(`
      UPDATE salon_services
      SET name = ?, category = ?, price = ?, duration_minutes = ?, assigned_staff_ids = ?,
          description = ?, is_active = ?, is_package = ?, package_items = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
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
    );

    return this.findById(service.id);
  }

  remove(id) {
    return this.db.prepare('DELETE FROM salon_services WHERE id = ?').run(id);
  }
}
