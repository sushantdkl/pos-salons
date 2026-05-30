import Database from '../index.js';

export class MenuRepository {
  constructor() {
    this.db = Database.getInstance();
  }
  
  getCategories() {
    return this.db.all(`
      SELECT * FROM menu_categories 
      WHERE is_active = 1 
      ORDER BY display_order
    `);
  }
  
  getItemsByCategory(categoryId) {
    return this.db.all(`
      SELECT mi.*, mi.id as item_id, mi.name as item_name, 
             mi.base_price as price, mi.is_vegetarian as is_veg,
             mc.name as category
      FROM menu_items mi
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mi.category_id = ? AND mi.is_available = 1
      ORDER BY mi.display_order, mi.name
    `, [categoryId]);
  }
  
  getAllItems(filters = {}) {
    let sql = `
      SELECT mi.*, mi.id as item_id, mi.name as item_name, 
             mi.base_price as price, mi.is_vegetarian as is_veg,
             mc.name as category
      FROM menu_items mi
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE 1=1
    `;
    const params = [];
    
    if (filters.category_id) {
      sql += ' AND mi.category_id = ?';
      params.push(filters.category_id);
    }
    
    if (filters.search) {
      sql += ' AND (mi.name LIKE ? OR mi.description LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }
    
    if (filters.is_vegetarian !== undefined) {
      sql += ' AND mi.is_vegetarian = ?';
      params.push(filters.is_vegetarian ? 1 : 0);
    }
    
    if (filters.available !== null && filters.available !== undefined) {
      sql += ' AND mi.is_available = ?';
      params.push(filters.available ? 1 : 0);
    }
    
    sql += ' ORDER BY mi.display_order, mi.name';
    
    return this.db.all(sql, params);
  }
  
  getItemById(id) {
    const item = this.db.get(`
      SELECT mi.*, mc.name as category_name
      FROM menu_items mi
      JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE mi.id = ?
    `, [id]);
    
    if (item) {
      item.variants = this.db.all(`
        SELECT * FROM menu_item_variants 
        WHERE menu_item_id = ?
        ORDER BY price_modifier
      `, [id]);
    }
    
    return item;
  }
  
  createItem(item) {
    const result = this.db.run(`
      INSERT INTO menu_items (
        item_code, name, description, category_id, base_price,
        preparation_time, is_vegetarian, is_vegan, is_spicy, spice_level,
        is_available, tags, allergens, calories
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      item.item_code, item.name, item.description, item.category_id, item.base_price,
      item.preparation_time || 15, item.is_vegetarian || 0, item.is_vegan || 0,
      item.is_spicy || 0, item.spice_level || 0, item.is_available !== false ? 1 : 0,
      item.tags ? JSON.stringify(item.tags) : null,
      item.allergens ? JSON.stringify(item.allergens) : null,
      item.calories
    ]);
    
    return result.lastInsertRowid;
  }
  
  updateItem(id, item) {
    return this.db.run(`
      UPDATE menu_items SET
        name = ?, description = ?, category_id = ?, base_price = ?,
        preparation_time = ?, is_vegetarian = ?, is_vegan = ?,
        is_spicy = ?, spice_level = ?, is_available = ?,
        tags = ?, allergens = ?, calories = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      item.name, item.description, item.category_id, item.base_price,
      item.preparation_time, item.is_vegetarian ? 1 : 0, item.is_vegan ? 1 : 0,
      item.is_spicy ? 1 : 0, item.spice_level, item.is_available ? 1 : 0,
      item.tags ? JSON.stringify(item.tags) : null,
      item.allergens ? JSON.stringify(item.allergens) : null,
      item.calories, id
    ]);
  }
  
  toggleAvailability(id) {
    return this.db.run(`
      UPDATE menu_items 
      SET is_available = NOT is_available,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);
  }
  
  deleteItem(id) {
    return this.db.run('DELETE FROM menu_items WHERE id = ?', [id]);
  }
}
