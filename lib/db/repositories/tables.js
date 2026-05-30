import Database from '../index.js';

export class TableRepository {
  constructor() {
    this.db = Database.getInstance();
  }
  
  getAll(filters = {}) {
    let sql = `SELECT t.*, t.id as table_id, t.current_order_id,
               o.order_number,
               SUM(oi.subtotal) as current_order_amount
        FROM tables t
        LEFT JOIN orders o ON t.current_order_id = o.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1`;
    const params = [];
    
    if (filters.floor) {
      sql += ' AND t.floor = ?';
      params.push(filters.floor);
    }
    
    if (filters.section) {
      sql += ' AND t.section = ?';
      params.push(filters.section);
    }
    
    if (filters.status) {
      sql += ' AND t.status = ?';
      params.push(filters.status);
    }
    
    sql += ' GROUP BY t.id ORDER BY t.floor, t.section, t.table_number';
    
    return this.db.all(sql, params);
  }
  
  getById(id) {
    return this.db.get('SELECT *, id as table_id FROM tables WHERE id = ?', [id]);
  }
  
  getByNumber(tableNumber) {
    return this.db.get('SELECT *, id as table_id FROM tables WHERE table_number = ?', [tableNumber]);
  }
  
  updateStatus(id, status) {
    return this.db.run(`
      UPDATE tables 
      SET status = ?
      WHERE id = ?
    `, [status, id]);
  }
  
  assignWaiter(tableId, waiterId) {
    return this.db.run(`
      UPDATE tables 
      SET waiter_id = ?
      WHERE id = ?
    `, [waiterId, tableId]);
  }
  
  clearTable(id) {
    return this.db.run(`
      UPDATE tables 
      SET status = 'available',
          current_order_id = NULL,
          waiter_id = NULL,
          occupied_at = NULL
      WHERE id = ?
    `, [id]);
  }
  
  getAvailableTables() {
    return this.db.all(`
      SELECT *, id as table_id FROM tables 
      WHERE status = 'available'
      ORDER BY capacity, table_number
    `);
  }
  
  getOccupiedTables() {
    return this.db.all(`
      SELECT t.*, t.id as table_id, o.order_number, o.created_at as order_time,
             u.full_name as waiter_name,
             SUM(oi.subtotal) as current_amount
      FROM tables t
      LEFT JOIN orders o ON t.current_order_id = o.id
      LEFT JOIN users u ON t.waiter_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE t.status = 'occupied'
      GROUP BY t.id
      ORDER BY t.occupied_at
    `);
  }
}
