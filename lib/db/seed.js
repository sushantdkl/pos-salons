// Seed data for Restaurant POS System
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, '../../pos_restaurant.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

console.log('🌱 Seeding database...\n');

// Initialize schema first
console.log('📋 Creating database schema...');
const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);
console.log('✅ Schema created\n');

// Seed Users
console.log('👥 Seeding users...');
const users = [
  { username: 'admin', pin: hashPin('123456'), full_name: 'System Admin', role: 'admin', phone: '9801234567' },
  { username: 'john', pin: hashPin('1234'), full_name: 'John Sharma', role: 'waiter', phone: '9801234568' },
  { username: 'ram', pin: hashPin('4567'), full_name: 'Ram Thapa', role: 'waiter', phone: '9801234569' },
  { username: 'sita', pin: hashPin('7890'), full_name: 'Sita Gurung', role: 'cashier', phone: '9801234570' },
  { username: 'chef', pin: hashPin('1111'), full_name: 'Chef Kumar', role: 'kitchen', phone: '9801234571' },
];

const insertUser = db.prepare(`
  INSERT INTO users (username, pin, full_name, role, phone)
  VALUES (?, ?, ?, ?, ?)
`);

users.forEach(user => {
  insertUser.run(user.username, user.pin, user.full_name, user.role, user.phone);
});

console.log(`✓ Created ${users.length} users`);

// Seed Tables
console.log('🪑 Seeding restaurant tables...');
const tables = [
  { table_number: 'T-01', floor: 'Ground', section: 'Window', capacity: 2, position_x: 100, position_y: 100 },
  { table_number: 'T-02', floor: 'Ground', section: 'Window', capacity: 2, position_x: 200, position_y: 100 },
  { table_number: 'T-03', floor: 'Ground', section: 'Window', capacity: 2, position_x: 300, position_y: 100 },
  { table_number: 'T-04', floor: 'Ground', section: 'Window', capacity: 2, position_x: 400, position_y: 100 },
  { table_number: 'T-05', floor: 'Ground', section: 'Center', capacity: 4, position_x: 100, position_y: 300 },
  { table_number: 'T-06', floor: 'Ground', section: 'Center', capacity: 4, position_x: 250, position_y: 300 },
  { table_number: 'T-07', floor: 'Ground', section: 'Center', capacity: 4, position_x: 400, position_y: 300 },
  { table_number: 'T-08', floor: 'Ground', section: 'Corner', capacity: 6, position_x: 100, position_y: 500 },
  { table_number: 'T-09', floor: 'Ground', section: 'Corner', capacity: 6, position_x: 350, position_y: 500 },
  { table_number: 'T-10', floor: 'First', section: 'Terrace', capacity: 8, position_x: 200, position_y: 200 },
];

const insertTable = db.prepare(`
  INSERT INTO tables (table_number, floor, section, capacity, position_x, position_y)
  VALUES (?, ?, ?, ?, ?, ?)
`);

tables.forEach(table => {
  insertTable.run(table.table_number, table.floor, table.section, table.capacity, table.position_x, table.position_y);
});

console.log(`✓ Created ${tables.length} tables`);

// Seed Menu Categories
console.log('📂 Seeding menu categories...');
const categories = [
  { name: 'Starters', display_order: 1, icon: '🥗' },
  { name: 'Soups', display_order: 2, icon: '🍲' },
  { name: 'Main Course', display_order: 3, icon: '🍛' },
  { name: 'Breads', display_order: 4, icon: '🍞' },
  { name: 'Rice & Noodles', display_order: 5, icon: '🍜' },
  { name: 'Desserts', display_order: 6, icon: '🍰' },
  { name: 'Beverages', display_order: 7, icon: '☕' },
  { name: 'Specials', display_order: 8, icon: '⭐' },
];

const insertCategory = db.prepare(`
  INSERT INTO menu_categories (name, display_order, icon)
  VALUES (?, ?, ?)
`);

categories.forEach(cat => {
  insertCategory.run(cat.name, cat.display_order, cat.icon);
});

console.log(`✓ Created ${categories.length} categories`);

// Seed Menu Items
console.log('🍽️ Seeding menu items...');
const menuItems = [
  // Starters
  { item_code: 'ITM001', name: 'Chicken Tikka', description: 'Grilled chicken marinated in spices', category_id: 1, base_price: 450, preparation_time: 20, is_vegetarian: 0, is_spicy: 1, spice_level: 3 },
  { item_code: 'ITM002', name: 'Paneer Tikka', description: 'Cottage cheese cubes with tandoori masala', category_id: 1, base_price: 380, preparation_time: 15, is_vegetarian: 1, is_spicy: 1, spice_level: 2 },
  { item_code: 'ITM003', name: 'Veg Momos (8 pcs)', description: 'Steamed dumplings with mixed vegetables', category_id: 1, base_price: 180, preparation_time: 15, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM004', name: 'Chicken Momos (8 pcs)', description: 'Steamed dumplings with minced chicken', category_id: 1, base_price: 220, preparation_time: 15, is_vegetarian: 0, is_spicy: 0 },
  { item_code: 'ITM005', name: 'French Fries', description: 'Crispy golden potato fries', category_id: 1, base_price: 150, preparation_time: 10, is_vegetarian: 1, is_spicy: 0 },
  
  // Soups
  { item_code: 'ITM006', name: 'Chicken Soup', description: 'Hot and sour chicken soup', category_id: 2, base_price: 250, preparation_time: 10, is_vegetarian: 0, is_spicy: 1, spice_level: 1 },
  { item_code: 'ITM007', name: 'Veg Soup', description: 'Mixed vegetable clear soup', category_id: 2, base_price: 200, preparation_time: 10, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM008', name: 'Tomato Soup', description: 'Creamy tomato soup', category_id: 2, base_price: 180, preparation_time: 8, is_vegetarian: 1, is_spicy: 0 },
  
  // Main Course
  { item_code: 'ITM009', name: 'Butter Chicken', description: 'Creamy tomato-based chicken curry', category_id: 3, base_price: 520, preparation_time: 25, is_vegetarian: 0, is_spicy: 0, spice_level: 1 },
  { item_code: 'ITM010', name: 'Dal Makhni', description: 'Black lentils in creamy gravy', category_id: 3, base_price: 320, preparation_time: 20, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM011', name: 'Paneer Butter Masala', description: 'Cottage cheese in rich tomato gravy', category_id: 3, base_price: 420, preparation_time: 20, is_vegetarian: 1, is_spicy: 0, spice_level: 1 },
  { item_code: 'ITM012', name: 'Chicken Curry', description: 'Traditional chicken curry with spices', category_id: 3, base_price: 480, preparation_time: 25, is_vegetarian: 0, is_spicy: 1, spice_level: 3 },
  { item_code: 'ITM013', name: 'Mixed Veg Curry', description: 'Assorted vegetables in curry sauce', category_id: 3, base_price: 350, preparation_time: 20, is_vegetarian: 1, is_spicy: 1, spice_level: 2 },
  
  // Breads
  { item_code: 'ITM014', name: 'Naan (Plain)', description: 'Leavened flatbread', category_id: 4, base_price: 45, preparation_time: 5, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM015', name: 'Garlic Naan', description: 'Naan with garlic topping', category_id: 4, base_price: 60, preparation_time: 5, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM016', name: 'Butter Naan', description: 'Naan brushed with butter', category_id: 4, base_price: 50, preparation_time: 5, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM017', name: 'Roti', description: 'Whole wheat flatbread', category_id: 4, base_price: 35, preparation_time: 5, is_vegetarian: 1, is_spicy: 0 },
  
  // Rice & Noodles
  { item_code: 'ITM018', name: 'Veg Fried Rice', description: 'Stir-fried rice with vegetables', category_id: 5, base_price: 280, preparation_time: 15, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM019', name: 'Chicken Fried Rice', description: 'Stir-fried rice with chicken', category_id: 5, base_price: 320, preparation_time: 15, is_vegetarian: 0, is_spicy: 0 },
  { item_code: 'ITM020', name: 'Veg Chowmein', description: 'Stir-fried noodles with vegetables', category_id: 5, base_price: 280, preparation_time: 15, is_vegetarian: 1, is_spicy: 1, spice_level: 2 },
  { item_code: 'ITM021', name: 'Chicken Chowmein', description: 'Stir-fried noodles with chicken', category_id: 5, base_price: 320, preparation_time: 15, is_vegetarian: 0, is_spicy: 1, spice_level: 2 },
  { item_code: 'ITM022', name: 'Jeera Rice', description: 'Basmati rice with cumin', category_id: 5, base_price: 180, preparation_time: 10, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM023', name: 'Veg Biryani', description: 'Fragrant rice with vegetables', category_id: 5, base_price: 350, preparation_time: 25, is_vegetarian: 1, is_spicy: 1, spice_level: 2 },
  
  // Desserts
  { item_code: 'ITM024', name: 'Gulab Jamun (2 pcs)', description: 'Deep-fried milk balls in sugar syrup', category_id: 6, base_price: 120, preparation_time: 5, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM025', name: 'Ice Cream (1 scoop)', description: 'Choice of vanilla, chocolate, or strawberry', category_id: 6, base_price: 100, preparation_time: 2, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM026', name: 'Kheer', description: 'Rice pudding with nuts', category_id: 6, base_price: 140, preparation_time: 5, is_vegetarian: 1, is_spicy: 0 },
  
  // Beverages
  { item_code: 'ITM027', name: 'Lassi (Sweet)', description: 'Yogurt-based drink', category_id: 7, base_price: 80, preparation_time: 3, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM028', name: 'Lassi (Salted)', description: 'Salted yogurt drink', category_id: 7, base_price: 80, preparation_time: 3, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM029', name: 'Masala Tea', description: 'Spiced milk tea', category_id: 7, base_price: 50, preparation_time: 3, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM030', name: 'Coffee', description: 'Hot brewed coffee', category_id: 7, base_price: 80, preparation_time: 3, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM031', name: 'Soft Drink', description: 'Coke, Pepsi, Sprite, or Fanta', category_id: 7, base_price: 60, preparation_time: 1, is_vegetarian: 1, is_spicy: 0 },
  { item_code: 'ITM032', name: 'Mineral Water', description: 'Bottled water', category_id: 7, base_price: 40, preparation_time: 1, is_vegetarian: 1, is_spicy: 0 },
];

const insertMenuItem = db.prepare(`
  INSERT INTO menu_items (item_code, name, description, category_id, base_price, preparation_time, is_vegetarian, is_spicy, spice_level)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

menuItems.forEach(item => {
  insertMenuItem.run(
    item.item_code, item.name, item.description, item.category_id, 
    item.base_price, item.preparation_time, item.is_vegetarian, 
    item.is_spicy, item.spice_level
  );
});

console.log(`✓ Created ${menuItems.length} menu items`);

// Seed Settings
console.log('⚙️ Seeding settings...');
const settings = [
  { key: 'business_name', value: 'Himalayan Restaurant', description: 'Restaurant name' },
  { key: 'address', value: 'Thamel, Kathmandu, Nepal', description: 'Business address' },
  { key: 'phone', value: '01-4123456', description: 'Contact number' },
  { key: 'email', value: 'info@himalayanrestaurant.com', description: 'Email address' },
  { key: 'tax_rate', value: '13', description: 'VAT percentage' },
  { key: 'service_charge', value: '10', description: 'Service charge percentage' },
  { key: 'currency', value: 'NPR', description: 'Currency code' },
  { key: 'currency_symbol', value: 'Rs', description: 'Currency symbol' },
  { key: 'receipt_footer', value: 'Thank you! Visit again', description: 'Receipt footer message' },
];

const insertSetting = db.prepare(`
  INSERT INTO settings (key, value, description)
  VALUES (?, ?, ?)
`);

settings.forEach(setting => {
  insertSetting.run(setting.key, setting.value, setting.description);
});

console.log(`✓ Created ${settings.length} settings`);

// Seed Branch
console.log('🏢 Seeding branch...');
db.prepare(`
  INSERT INTO branches (branch_code, name, address, phone, email)
  VALUES (?, ?, ?, ?, ?)
`).run('MAIN', 'Main Branch', 'Thamel, Kathmandu', '01-4123456', 'main@himalayanrestaurant.com');

console.log('✓ Created main branch');

console.log('\n✅ Database seeded successfully!');
console.log('\n📋 Default Login Credentials:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Admin:   username: admin,  PIN: 123456');
console.log('Waiter:  username: john,   PIN: 1234');
console.log('Waiter:  username: ram,    PIN: 4567');
console.log('Cashier: username: sita,   PIN: 7890');
console.log('Kitchen: username: chef,   PIN: 1111');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db.close();
