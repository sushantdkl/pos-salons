/**
 * Reset the QA database to a clean, known operational state.
 *
 *   DATABASE_URL=<..._qa> node scripts/qa/seed-qa.mjs
 *
 * QA ONLY: refuses any database whose name does not end in `_qa`.
 *
 * - Empties every TRANSACTIONAL table (bills, sessions, business days, expenses, savings,
 *   advances, tokens, corrections, credit) so each scenario starts from zero.
 * - Keeps reference data (services, products, staff, customers, settings, permissions).
 * - Adds fixed QA fixtures with exact prices so scenario totals are deterministic:
 *     users    qa_admin / qa_cashier / qa_barber   (password: QA_PASSWORD below)
 *     services QA Haircut Rs 5,000 · QA Colour Rs 3,000 · QA Trim Rs 700
 *     product  QA Serum Rs 1,000 (cost Rs 600), stock 50
 *     setting  advance_ceiling_percent = 50, QA barber base salary Rs 30,000
 */
import bcrypt from 'bcryptjs';
import pg from 'pg';

export const QA_PASSWORD = 'QaPass!2026';

const url = process.env.DATABASE_URL || '';
const dbName = (() => { try { return new URL(url).pathname.replace(/^\//, ''); } catch { return ''; } })();
if (!dbName.endsWith('_qa')) throw new Error(`Refusing to seed "${dbName}": QA seeding only runs against a *_qa database.`);

const TRANSACTIONAL_TABLES = [
  'salary_advance_applications', 'salary_advances', 'salary_payments',
  'customer_credit_collections', 'customer_credit_ledger',
  'payment_refunds', 'financial_corrections', 'salon_payment_allocations',
  'salon_bill_items', 'salon_bills', 'walk_in_tokens',
  'cash_movements', 'expenses', 'savings_deposits', 'inventory_movements',
  'store_sessions', 'business_days',
  'appointment_waitlist', 'appointment_events', 'appointment_services', 'appointments',
  'staff_time_off', 'staff_working_hours',
  'supplier_payments', 'purchase_items', 'purchases', 'suppliers',
  'hr_audit_log', 'hr_overtime', 'hr_leave_ledger', 'hr_leave_requests', 'hr_attendance_breaks', 'hr_attendance',
  'hr_holidays', 'hr_shift_assignments', 'hr_shifts',
  'loyalty_ledger', 'loyalty_claim_codes', 'customer_reviews', 'crm_audit_log',
];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`TRUNCATE ${TRANSACTIONAL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await client.query(`UPDATE document_sequences SET next_value = 1 WHERE document_type IN ('salon_bill', 'appointment', 'purchase', 'supplier_payment')`);

  const hash = bcrypt.hashSync(QA_PASSWORD, 10);
  const upsertUser = async (username, fullName, role) => {
    const row = await client.query(`
      INSERT INTO users (username, password_hash, full_name, role, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = TRUE
      RETURNING id
    `, [username, hash, fullName, role]);
    return row.rows[0].id;
  };
  await upsertUser('qa_admin', 'QA Admin', 'admin');
  await upsertUser('qa_cashier', 'QA Cashier', 'cashier');
  const barberId = await upsertUser('qa_barber', 'QA Barber', 'barber');
  await client.query(`
    INSERT INTO staff_profiles (user_id, display_name, salon_role, commission_percentage, base_salary)
    VALUES ($1, 'QA Barber', 'barber', 10, 30000)
    ON CONFLICT (user_id) DO UPDATE SET salon_role = 'barber', commission_percentage = 10, base_salary = 30000, pay_type = 'salary'
  `, [barberId]);
  // Owner-made expense categories and Cash In / Exchange permissions start from the defaults.
  await client.query('DELETE FROM expense_categories WHERE is_system = FALSE');
  await client.query("UPDATE expense_categories SET is_active = TRUE WHERE is_system = TRUE AND name NOT IN ('CLEANING', 'MAINTENANCE', 'OTHER_EXPENSE')");
  await client.query("UPDATE role_permissions SET allowed = FALSE WHERE permission_key IN ('cash.movements', 'cash.exchange')");

  const upsertService = async (name, category, price) => {
    const existing = await client.query('SELECT id FROM salon_services WHERE name = $1', [name]);
    if (existing.rowCount) {
      await client.query('UPDATE salon_services SET price = $2, category = $3, is_active = TRUE WHERE id = $1', [existing.rows[0].id, price, category]);
      return existing.rows[0].id;
    }
    const row = await client.query(
      'INSERT INTO salon_services (name, category, price, duration_minutes, is_active) VALUES ($1, $2, $3, 30, TRUE) RETURNING id',
      [name, category, price]
    );
    return row.rows[0].id;
  };
  await upsertService('QA Haircut', 'Haircut', 5000);
  await upsertService('QA Colour', 'Hair Color', 3000);
  await upsertService('QA Trim', 'Beard', 700);

  const product = await client.query('SELECT id FROM salon_products WHERE name = $1', ['QA Serum']);
  if (product.rowCount) {
    await client.query(`UPDATE salon_products SET selling_price = 1000, purchase_price = 600, current_stock = 50, status = 'active' WHERE id = $1`, [product.rows[0].id]);
  } else {
    await client.query(`
      INSERT INTO salon_products (name, category, purchase_price, selling_price, current_stock, low_stock_threshold, status)
      VALUES ('QA Serum', 'Hair Care', 600, 1000, 50, 5, 'active')
    `);
  }

  await client.query(`
    INSERT INTO system_settings (setting_key, setting_value) VALUES
      ('advance_ceiling_percent', '50'), ('salon_open_time', '09:00'), ('salon_close_time', '20:00'),
      ('appointment_slot_minutes', '15'), ('online_booking_enabled', 'true'),
      ('online_booking_instant_confirm', 'false'), ('online_booking_max_days_ahead', '30')
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `);

  await client.query('COMMIT');
  console.log(`QA database ${dbName} reset: transactional tables emptied, QA fixtures ready.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
