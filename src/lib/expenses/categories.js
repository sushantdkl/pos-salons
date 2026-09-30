/**
 * EXPENSE CATEGORIES — the list the admin Expenses page offers (table expense_categories).
 *
 * `name` is what an expense row stores in expenses.category; `label` is what people read.
 *   system rows   seeded by the migration; can be hidden but never renamed or removed
 *   locked rows   Staff Salary / Staff Commission — payroll writes them, always active
 *   custom rows   created by the owner; can be renamed (existing expenses follow the new
 *                 name in the same transaction), regrouped, hidden, or removed while unused
 * Savings are never an expense category (see savings_deposits).
 */

import { logAction } from '@/lib/db/helpers';

export const CATEGORY_GROUPS = ['Running costs', 'Salon upkeep', 'Stock & staff', 'Daily petty cash', 'Anything else'];
const FORBIDDEN = ['DAILY_SAVING', 'CASH_ADJUSTMENT'];

const clean = (value) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function mapCategory(row) {
  return {
    id: Number(row.id),
    name: row.name,
    label: row.label,
    group: row.group_label,
    isSystem: Boolean(row.is_system),
    isLocked: Boolean(row.is_locked),
    isActive: Boolean(row.is_active),
    sortOrder: Number(row.sort_order || 0),
    usage: row.usage === undefined ? undefined : Number(row.usage || 0),
  };
}

export async function listCategories(db, { includeInactive = false, withUsage = false } = {}) {
  const rows = await db.all(`
    SELECT c.*${withUsage ? `, (SELECT COUNT(*) FROM expenses e WHERE e.category = c.name AND e.deleted_at IS NULL)::int AS usage` : ''}
    FROM expense_categories c
    ${includeInactive ? '' : 'WHERE c.is_active = TRUE'}
    ORDER BY c.sort_order ASC, c.label ASC
  `);
  return rows.map(mapCategory);
}

/** Validates a category for a NEW or EDITED expense. Hidden categories stay valid for rows that already use them. */
export async function assertExpenseCategory(db, name, { previous = null } = {}) {
  const value = clean(name);
  if (FORBIDDEN.includes(value)) throw badRequest('Savings deposits are recorded on the Savings page, not as an expense.');
  const row = await db.get('SELECT name, is_active FROM expense_categories WHERE name = ?', [value]);
  if (!row) throw badRequest('Valid expense category is required');
  if (!row.is_active && value !== previous) throw badRequest('That category is hidden. Show it again in Manage categories, or pick another.');
  return row.name;
}

/** name -> label for every category, hidden ones included (old records still need a label). */
export async function categoryLabels(db) {
  const rows = await db.all('SELECT name, label FROM expense_categories');
  return Object.fromEntries(rows.map((row) => [row.name, row.label]));
}

export async function createCategory(db, user, input) {
  const label = clean(input.label || input.name).slice(0, 60);
  if (label.length < 2) throw badRequest('Category name must be at least 2 characters');
  if (FORBIDDEN.includes(label.toUpperCase())) throw badRequest('That name is reserved');
  const group = CATEGORY_GROUPS.includes(input.group) ? input.group : 'Anything else';
  const clash = await db.get('SELECT id FROM expense_categories WHERE LOWER(name) = LOWER(?) OR LOWER(label) = LOWER(?)', [label, label]);
  if (clash) throw badRequest('A category with this name already exists', 409);
  const result = await db.run(`
    INSERT INTO expense_categories (name, label, group_label, is_system, is_locked, is_active, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, FALSE, FALSE, TRUE, 80, ?, ?)
  `, [label, label, group, user.id, user.id]);
  await logAction(db, user.id, 'create', 'expense_category', result.lastInsertRowid, label);
  return mapCategory(await db.get('SELECT * FROM expense_categories WHERE id = ?', [result.lastInsertRowid]));
}

export async function updateCategory(db, user, input) {
  const id = Number(input.id || 0);
  return db.transaction(async (tx) => {
    const current = await tx.get('SELECT * FROM expense_categories WHERE id = ? FOR UPDATE', [id]);
    if (!current) throw badRequest('Category not found', 404);
    const next = {
      label: current.label,
      group: current.group_label,
      active: Boolean(current.is_active),
      name: current.name,
    };
    if (input.isActive !== undefined) {
      if (current.is_locked && input.isActive === false) throw badRequest('Staff Salary and Staff Commission are used by payroll and cannot be hidden');
      next.active = Boolean(input.isActive);
    }
    if (input.group !== undefined) {
      if (!CATEGORY_GROUPS.includes(input.group)) throw badRequest('Choose a valid group');
      next.group = input.group;
    }
    if (input.label !== undefined && clean(input.label) !== current.label) {
      if (current.is_system) throw badRequest('Built-in categories cannot be renamed. Create your own category instead.');
      const label = clean(input.label).slice(0, 60);
      if (label.length < 2) throw badRequest('Category name must be at least 2 characters');
      const clash = await tx.get('SELECT id FROM expense_categories WHERE id <> ? AND (LOWER(name) = LOWER(?) OR LOWER(label) = LOWER(?))', [id, label, label]);
      if (clash) throw badRequest('A category with this name already exists', 409);
      // Existing expenses move with the rename so reports never show an orphaned category.
      await tx.run('UPDATE expenses SET category = ?, updated_at = NOW() WHERE category = ?', [label, current.name]);
      next.label = label;
      next.name = label;
    }
    await tx.run(`
      UPDATE expense_categories SET name = ?, label = ?, group_label = ?, is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?
    `, [next.name, next.label, next.group, next.active, user.id, id]);
    await logAction(tx, user.id, 'update', 'expense_category', id, `${current.label} -> ${next.label}${next.active ? '' : ' (hidden)'}`);
    return mapCategory(await tx.get('SELECT * FROM expense_categories WHERE id = ?', [id]));
  });
}

export async function deleteCategory(db, user, id) {
  const current = await db.get('SELECT * FROM expense_categories WHERE id = ?', [Number(id)]);
  if (!current) throw badRequest('Category not found', 404);
  if (current.is_system) throw badRequest('Built-in categories cannot be removed. You can hide them instead.');
  const used = await db.get('SELECT COUNT(*)::int AS count FROM expenses WHERE category = ?', [current.name]);
  if (Number(used?.count || 0) > 0) throw badRequest(`“${current.label}” is used by ${used.count} expense(s). Hide it instead so old records keep their category.`, 409);
  await db.run('DELETE FROM expense_categories WHERE id = ?', [current.id]);
  await logAction(db, user.id, 'delete', 'expense_category', current.id, current.label);
  return { id: Number(current.id) };
}
