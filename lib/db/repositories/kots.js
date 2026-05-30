import Database from '../index.js';

export class KotRepository {
  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Create a new KOT from order items
   */
  create({ order_id, station, items, prepared_by = null }) {
    return this.db.transaction(() => {
      // Insert KOT
      const result = this.db.run(
        `INSERT INTO kots (order_id, station, status, prepared_by)
         VALUES (?, ?, 'pending', ?)`,
        [order_id, station, prepared_by]
      );

      const kot_id = result.lastInsertRowid;

      // Insert KOT items
      const insertItem = this.db.prepare(
        `INSERT INTO kot_items (kot_id, order_item_id, menu_item_id, quantity, special_instructions, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      );

      for (const item of items) {
        insertItem.run(
          kot_id,
          item.order_item_id,
          item.menu_item_id,
          item.quantity,
          item.special_instructions || null
        );
      }

      return kot_id;
    });
  }

  /**
   * Get KOT by ID with all items
   */
  getById(id) {
    const kot = this.db.get(
      `SELECT 
        k.*,
        k.id as kot_id,
        o.order_number,
        o.table_id,
        t.table_number
       FROM kots k
       LEFT JOIN orders o ON k.order_id = o.id
       LEFT JOIN tables t ON o.table_id = t.id
       WHERE k.id = ?`,
      [id]
    );

    if (!kot) return null;

    // Get items
    kot.items = this.getItems(id);

    return kot;
  }

  /**
   * Get KOTs by order ID
   */
  getByOrder(orderId) {
    const kots = this.db.all(
      `SELECT 
        k.*,
        k.id as kot_id,
        'KOT-' || k.id as kot_number,
        COUNT(ki.id) as total_items
       FROM kots k
       LEFT JOIN kot_items ki ON k.id = ki.kot_id
       WHERE k.order_id = ?
       GROUP BY k.id
       ORDER BY k.printed_at DESC`,
      [orderId]
    );
    
    // Fetch items for each KOT
    return kots.map(kot => ({
      ...kot,
      items: this.getItems(kot.kot_id)
    }));
  }

  /**
   * Get KOTs by status and station
   */
  getByFilters({ status = null, station = null, date = null, limit = 50 }) {
    let query = `
      SELECT 
        k.*,
        k.id as kot_id,
        o.order_number,
        o.table_id,
        t.table_number,
        COUNT(ki.id) as total_items,
        SUM(CASE WHEN ki.status = 'completed' THEN 1 ELSE 0 END) as completed_items
      FROM kots k
      LEFT JOIN orders o ON k.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN kot_items ki ON k.id = ki.kot_id
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += ` AND k.status = ?`;
      params.push(status);
    }

    if (station) {
      query += ` AND k.station = ?`;
      params.push(station);
    }

    if (date) {
      query += ` AND DATE(k.printed_at) = DATE(?)`;
      params.push(date);
    }

    query += `
      GROUP BY k.id
      ORDER BY 
        CASE k.status 
          WHEN 'pending' THEN 1 
          WHEN 'preparing' THEN 2 
          WHEN 'ready' THEN 3 
          ELSE 4 
        END,
        k.printed_at DESC
      LIMIT ?
    `;
    params.push(limit);

    return this.db.all(query, params);
  }

  /**
   * Get pending KOTs for a specific station
   */
  getPendingByStation(station) {
    return this.getByFilters({ status: 'pending', station });
  }

  /**
   * Get all active KOTs (pending, preparing, ready)
   */
  getActive() {
    return this.db.all(
      `SELECT 
        k.*,
        k.id as kot_id,
        o.order_number,
        o.table_id,
        t.table_number,
        COUNT(ki.id) as total_items,
        SUM(CASE WHEN ki.status = 'completed' THEN 1 ELSE 0 END) as completed_items
       FROM kots k
       LEFT JOIN orders o ON k.order_id = o.id
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN kot_items ki ON k.id = ki.kot_id
       WHERE k.status IN ('pending', 'preparing', 'ready')
       GROUP BY k.id
       ORDER BY 
         CASE k.status 
           WHEN 'pending' THEN 1 
           WHEN 'preparing' THEN 2 
           ELSE 3 
         END,
         k.printed_at DESC`
    );
  }

  /**
   * Update KOT status
   */
  updateStatus(id, status, prepared_by = null) {
    const params = [status];
    let query = `UPDATE kots SET status = ?`;

    if (status === 'preparing') {
      query += `, started_at = CURRENT_TIMESTAMP`;
    } else if (status === 'ready') {
      query += `, completed_at = CURRENT_TIMESTAMP`;
    }

    query += ` WHERE id = ?`;
    params.push(id);

    const result = this.db.run(query, params);
    return result.changes > 0;
  }

  /**
   * Update individual KOT item status
   */
  updateItemStatus(kot_item_id, status) {
    const result = this.db.run(
      `UPDATE kot_items SET status = ? WHERE id = ?`,
      [status, kot_item_id]
    );

    if (result.changes > 0) {
      // Check if all items in the KOT are completed
      const kotItem = this.db.get(
        `SELECT kot_id FROM kot_items WHERE id = ?`,
        [kot_item_id]
      );

      if (kotItem) {
        const pendingCount = this.db.get(
          `SELECT COUNT(*) as count FROM kot_items 
           WHERE kot_id = ? AND status != 'completed'`,
          [kotItem.kot_id]
        );

        // If all items completed, mark KOT as ready
        if (pendingCount.count === 0) {
          this.updateStatus(kotItem.kot_id, 'ready');
        }
      }
    }

    return result.changes > 0;
  }

  /**
   * Get KOT items by KOT ID
   */
  getItems(kot_id) {
    return this.db.all(
      `SELECT 
        ki.*,
        oi.special_instructions,
        mi.name as item_name,
        mi.preparation_time as prep_time_minutes
       FROM kot_items ki
       JOIN order_items oi ON ki.order_item_id = oi.id
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE ki.kot_id = ?
       ORDER BY ki.id`,
      [kot_id]
    );
  }

  /**
   * Mark all items in a KOT as completed
   */
  completeAllItems(kot_id) {
    return this.db.transaction(() => {
      // Update all items to completed
      this.db.run(
        `UPDATE kot_items SET status = 'completed' WHERE kot_id = ?`,
        [kot_id]
      );

      // Update KOT status to ready
      this.updateStatus(kot_id, 'ready');

      return true;
    });
  }

  /**
   * Get kitchen performance stats for a date
   */
  getStats(date = new Date().toISOString().split('T')[0]) {
    const stats = this.db.get(
      `SELECT 
        COUNT(*) as total_kots,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_kots,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing_kots,
        SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) as ready_kots,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_kots,
        AVG(
          CASE WHEN completed_at IS NOT NULL 
          THEN (julianday(completed_at) - julianday(printed_at)) * 24 * 60
          ELSE NULL END
        ) as avg_prep_time_minutes
       FROM kots
       WHERE DATE(printed_at) = DATE(?)`,
      [date]
    );

    // Get stats by station
    const stationStats = this.db.all(
      `SELECT 
        station,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing,
        AVG(
          CASE WHEN completed_at IS NOT NULL 
          THEN (julianday(completed_at) - julianday(printed_at)) * 24 * 60
          ELSE NULL END
        ) as avg_prep_time
       FROM kots
       WHERE DATE(printed_at) = DATE(?)
       GROUP BY station`,
      [date]
    );

    return {
      ...stats,
      by_station: stationStats
    };
  }
}
