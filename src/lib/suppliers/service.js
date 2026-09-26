/**
 * SUPPLIERS — suppliers, purchases (stock received) and supplier payments.
 *
 * Accounting (cash basis, like every other outflow in this POS):
 *   - A PURCHASE adds stock and raises what we owe the supplier. It creates no expense and
 *     moves no money.
 *   - A PAYMENT writes exactly one 'Product Purchase' expense (cash / online), linked by
 *     expenses.supplier_payment_id. That expense is what reduces Expected Cash, the online
 *     balance and appears in Summary / Analytics / reports — so nothing is counted twice.
 *   - Supplier balance = opening balance + purchases received - payments made. A payment can
 *     never exceed what is owed.
 * Integrity:
 *   - Cash payments go through the drawer guard (cannot pay out cash the drawer does not hold).
 *   - A payment is voidable only on its own day while its drawer session (if cash) is still
 *     open, so a closed day's figures and close snapshot never change.
 *   - A purchase is voidable only while its stock is still on the shelf and voiding would not
 *     leave the supplier owing US money.
 *   - Every write is idempotent (Idempotency-Key) and runs in one transaction.
 */

import { logAction } from '@/lib/db/helpers';
import { cleanText } from '@/lib/salon-schema';
import { normalizePhone, PHONE_ERROR_MESSAGE } from '@/lib/validation/phone';
import { salonDateString } from '@/lib/reports/dashboard-period';
import { assertDrawerCashAvailable, getOpenSession } from '@/lib/business-day/service';

export const SUPPLIER_EXPENSE_CATEGORY = 'Product Purchase';

function httpError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function money(value, label = 'Amount') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw httpError(`${label} must be zero or more`);
  return Math.round(parsed * 100) / 100;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

async function nextNumber(tx, type, prefix) {
  const row = await tx.get(`
    INSERT INTO document_sequences(document_type, next_value) VALUES (?, 2)
    ON CONFLICT (document_type) DO UPDATE SET next_value = document_sequences.next_value + 1, updated_at = NOW()
    RETURNING next_value - 1 AS value
  `, [type]);
  return `${prefix}-${String(row.value).padStart(6, '0')}`;
}

/* ------------------------------------------------------------- suppliers */

const BALANCE_SQL = `
  s.opening_balance
  + COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'RECEIVED'), 0)
  - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id AND sp.status = 'ACTIVE'), 0)
`;

function mapSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    panVat: row.pan_vat,
    openingBalance: round2(row.opening_balance),
    notes: row.notes,
    isActive: Boolean(row.is_active),
    balance: round2(row.balance),
    purchasedTotal: round2(row.purchased_total),
    paidTotal: round2(row.paid_total),
    lastPurchaseDate: row.last_purchase_date || null,
    createdAt: row.created_at,
  };
}

const SUPPLIER_SELECT = `
  SELECT s.*,
         (${BALANCE_SQL}) AS balance,
         COALESCE((SELECT SUM(p.total) FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'RECEIVED'), 0) AS purchased_total,
         COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = s.id AND sp.status = 'ACTIVE'), 0) AS paid_total,
         (SELECT MAX(p.purchase_date)::text FROM purchases p WHERE p.supplier_id = s.id AND p.status = 'RECEIVED') AS last_purchase_date
  FROM suppliers s
`;

export async function listSuppliers(db, { includeInactive = false, q = '' } = {}) {
  const clauses = [];
  const params = [];
  if (!includeInactive) clauses.push('s.is_active = TRUE');
  const search = cleanText(q, '');
  if (search) { clauses.push('(s.name ILIKE ? OR s.phone ILIKE ? OR s.contact_person ILIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = await db.all(`${SUPPLIER_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY s.name LIMIT 500`, params);
  const suppliers = rows.map(mapSupplier);
  return {
    suppliers,
    totals: {
      suppliers: suppliers.length,
      payable: round2(suppliers.reduce((sum, supplier) => sum + Math.max(0, supplier.balance), 0)),
      withBalance: suppliers.filter((supplier) => supplier.balance > 0).length,
    },
  };
}

export async function getSupplier(db, id) {
  const row = await db.get(`${SUPPLIER_SELECT} WHERE s.id = ?`, [id]);
  if (!row) throw httpError('Supplier not found', 404);
  return mapSupplier(row);
}

function supplierFields(input) {
  const name = cleanText(input.name, '');
  if (!name) throw httpError('Supplier name is required');
  const rawPhone = String(input.phone || '').trim();
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) throw httpError(PHONE_ERROR_MESSAGE);
  return {
    name,
    contact_person: cleanText(input.contactPerson, null),
    phone,
    email: cleanText(input.email, null),
    address: cleanText(input.address, null),
    pan_vat: cleanText(input.panVat, null),
    notes: cleanText(input.notes, null),
  };
}

export async function createSupplier(db, user, input) {
  const fields = supplierFields(input);
  const opening = money(input.openingBalance || 0, 'Opening balance');
  const duplicate = await db.get('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND is_active', [fields.name]);
  if (duplicate) throw httpError('A supplier with this name already exists', 409);
  const result = await db.run(`
    INSERT INTO suppliers (name, contact_person, phone, email, address, pan_vat, notes, opening_balance, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [fields.name, fields.contact_person, fields.phone, fields.email, fields.address, fields.pan_vat, fields.notes, opening, user.id, user.id]);
  await logAction(db, user.id, 'create', 'supplier', result.lastInsertRowid, fields.name);
  return getSupplier(db, result.lastInsertRowid);
}

/**
 * Update contact details / active flag. The opening balance can only change while the
 * supplier has no purchases or payments, so the ledger history can never shift underneath.
 */
export async function updateSupplier(db, user, id, input) {
  const current = await getSupplier(db, id);
  const fields = supplierFields({ ...current, ...input });
  let opening = current.openingBalance;
  if (input.openingBalance !== undefined && money(input.openingBalance, 'Opening balance') !== current.openingBalance) {
    const activity = await db.get(`
      SELECT (SELECT COUNT(*) FROM purchases WHERE supplier_id = ?) + (SELECT COUNT(*) FROM supplier_payments WHERE supplier_id = ?) AS n
    `, [id, id]);
    if (Number(activity?.n || 0) > 0) throw httpError('The opening balance cannot change once the supplier has purchases or payments', 409);
    opening = money(input.openingBalance, 'Opening balance');
  }
  const isActive = input.isActive === undefined ? current.isActive : Boolean(input.isActive);
  if (!isActive && current.balance > 0) throw httpError('Settle the outstanding balance before deactivating this supplier', 409);
  const duplicate = await db.get('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND is_active AND id <> ?', [fields.name, id]);
  if (duplicate && isActive) throw httpError('A supplier with this name already exists', 409);
  await db.run(`
    UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, pan_vat = ?, notes = ?,
      opening_balance = ?, is_active = ?, updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `, [fields.name, fields.contact_person, fields.phone, fields.email, fields.address, fields.pan_vat, fields.notes, opening, isActive, user.id, id]);
  await logAction(db, user.id, 'update', 'supplier', id, fields.name);
  return getSupplier(db, id);
}

/* ----------------------------------------------------------- payments */

async function supplierBalance(tx, supplierId) {
  const row = await tx.get(`SELECT (${BALANCE_SQL}) AS balance FROM suppliers s WHERE s.id = ?`, [supplierId]);
  return round2(row?.balance);
}

/**
 * Pay a supplier inside the caller's transaction. Writes the payment and its single
 * 'Product Purchase' expense; the drawer guard runs for the cash part.
 */
async function insertPayment(tx, user, { supplier, purchaseId = null, amount, method, paymentDate, reference, notes, allowOverdraw, idempotencyKey }) {
  if (!['cash', 'online'].includes(method)) throw httpError('Choose cash or online');
  const value = money(amount);
  if (value <= 0) throw httpError('Payment amount must be greater than zero');
  const owed = await supplierBalance(tx, supplier.id);
  if (value > owed + 0.001) throw httpError(`This payment is more than the ${round2(owed).toFixed(2)} owed to ${supplier.name}`);

  const session = await getOpenSession(tx);
  if (method === 'cash') {
    if (!session) throw httpError('Open the store before paying a supplier in cash — cash leaves the drawer.', 409, { code: 'STORE_CLOSED' });
    await assertDrawerCashAvailable(tx, value, { allowOverdraw: Boolean(allowOverdraw) && user.role === 'admin', label: 'supplier payment' });
  }
  const scope = session ? { businessDayId: session.business_day_id, sessionId: session.id } : { businessDayId: null, sessionId: null };
  const number = await nextNumber(tx, 'supplier_payment', 'SPAY');
  const payment = await tx.run(`
    INSERT INTO supplier_payments (payment_number, supplier_id, purchase_id, amount, payment_method, payment_date, reference_number,
      notes, business_day_id, store_session_id, created_by, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?::date, ?, ?, ?, ?, ?, ?)
  `, [number, supplier.id, purchaseId, value, method, paymentDate, cleanText(reference, null), cleanText(notes, null),
    scope.businessDayId, scope.sessionId, user.id, idempotencyKey || null]);
  const paymentId = payment.lastInsertRowid;
  const expense = await tx.run(`
    INSERT INTO expenses (
      title, category, amount, payment_method, cash_amount, online_amount, paid_by, paid_to, expense_date, notes,
      reference_number, attachment_url, record_type, created_by, updated_by, business_day_id, store_session_id, supplier_payment_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?, ?, '', 'EXPENSE', ?, ?, ?, ?, ?)
  `, [
    `Supplier payment — ${supplier.name}`, SUPPLIER_EXPENSE_CATEGORY, value, method,
    method === 'cash' ? value : 0, method === 'online' ? value : 0,
    user.full_name || user.username || 'Admin', supplier.name, paymentDate,
    cleanText(notes, '') || `Payment ${number}`, number, user.id, user.id, scope.businessDayId, scope.sessionId, paymentId,
  ]);
  await tx.run('UPDATE supplier_payments SET expense_id = ? WHERE id = ?', [expense.lastInsertRowid, paymentId]);
  await logAction(tx, user.id, 'create', 'supplier_payment', paymentId, `${number} ${value} ${method}`);
  return { id: paymentId, number, amount: value };
}

export async function paySupplier(db, user, input) {
  const idempotencyKey = cleanText(input.idempotencyKey, '') || null;
  if (idempotencyKey) {
    const prior = await db.get('SELECT id, payment_number, amount FROM supplier_payments WHERE idempotency_key = ?', [idempotencyKey]);
    if (prior) return { id: prior.id, number: prior.payment_number, amount: round2(prior.amount), duplicate: true };
  }
  const paymentDate = isIsoDate(input.paymentDate) ? input.paymentDate : salonDateString();
  if (paymentDate > salonDateString()) throw httpError('A payment cannot be dated in the future');
  return db.transaction(async (tx) => {
    const supplier = await tx.get('SELECT id, name FROM suppliers WHERE id = ? FOR UPDATE', [Number(input.supplierId)]);
    if (!supplier) throw httpError('Supplier not found', 404);
    const purchaseId = Number(input.purchaseId || 0) || null;
    if (purchaseId) {
      const purchase = await tx.get("SELECT id FROM purchases WHERE id = ? AND supplier_id = ? AND status = 'RECEIVED'", [purchaseId, supplier.id]);
      if (!purchase) throw httpError('That purchase does not belong to this supplier');
    }
    return insertPayment(tx, user, {
      supplier, purchaseId, amount: input.amount, method: String(input.method || '').toLowerCase(),
      paymentDate, reference: input.reference, notes: input.notes, allowOverdraw: input.allowOverdraw, idempotencyKey,
    });
  });
}

export async function voidSupplierPayment(db, user, id, reason) {
  const why = cleanText(reason, '');
  if (!why) throw httpError('A reason is required');
  return db.transaction(async (tx) => {
    const payment = await tx.get(`
      SELECT sp.*, sp.payment_date::text AS payment_day, ss.status AS session_status
      FROM supplier_payments sp LEFT JOIN store_sessions ss ON ss.id = sp.store_session_id
      WHERE sp.id = ? FOR UPDATE OF sp
    `, [id]);
    if (!payment) throw httpError('Payment not found', 404);
    if (payment.status !== 'ACTIVE') throw httpError('This payment is already void', 409);
    if (payment.payment_day !== salonDateString()) throw httpError('Only today\'s payments can be voided. Record a correcting payment or adjustment instead.', 409);
    if (payment.payment_method === 'cash' && payment.session_status !== 'OPEN') {
      throw httpError('The drawer session for this cash payment is closed, so it can no longer be voided.', 409);
    }
    await tx.run(`UPDATE supplier_payments SET status = 'VOID', void_reason = ?, voided_at = NOW(), voided_by = ? WHERE id = ?`, [why, user.id, id]);
    if (payment.expense_id) {
      await tx.run('UPDATE expenses SET deleted_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [user.id, payment.expense_id]);
    }
    await logAction(tx, user.id, 'void', 'supplier_payment', id, why);
    return { id, voided: true };
  });
}

/* ------------------------------------------------------------ purchases */

/**
 * Receive stock from a supplier. Optionally pays part (or all) of it immediately, which is
 * an ordinary supplier payment in the same transaction.
 */
export async function createPurchase(db, user, input) {
  const idempotencyKey = cleanText(input.idempotencyKey, '') || null;
  if (idempotencyKey) {
    const prior = await db.get('SELECT id FROM purchases WHERE idempotency_key = ?', [idempotencyKey]);
    if (prior) return { purchase: await getPurchase(db, prior.id), duplicate: true };
  }
  const purchaseDate = isIsoDate(input.purchaseDate) ? input.purchaseDate : salonDateString();
  if (purchaseDate > salonDateString()) throw httpError('A purchase cannot be dated in the future');
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw httpError('Add at least one product');
  if (items.length > 100) throw httpError('Too many lines in one purchase');
  const updateCost = input.updateCostPrice !== false;

  const purchaseId = await db.transaction(async (tx) => {
    const supplier = await tx.get('SELECT id, name, is_active FROM suppliers WHERE id = ? FOR UPDATE', [Number(input.supplierId)]);
    if (!supplier) throw httpError('Choose a supplier');
    if (!supplier.is_active) throw httpError('This supplier is inactive');

    const lines = [];
    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw httpError('Each quantity must be a whole number above zero');
      const unitCost = money(item.unitCost, 'Unit cost');
      const product = await tx.get('SELECT id, name, current_stock FROM salon_products WHERE id = ? FOR UPDATE', [Number(item.productId)]);
      if (!product) throw httpError('A product in this purchase no longer exists');
      lines.push({ product, quantity, unitCost, lineTotal: round2(quantity * unitCost) });
    }
    const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const discount = money(input.discount || 0, 'Discount');
    const tax = money(input.tax || 0, 'Tax');
    if (discount > subtotal) throw httpError('Discount cannot exceed the subtotal');
    const total = round2(subtotal - discount + tax);

    const session = await getOpenSession(tx);
    const number = await nextNumber(tx, 'purchase', 'PUR');
    const purchase = await tx.run(`
      INSERT INTO purchases (purchase_number, supplier_id, purchase_date, supplier_invoice, subtotal, discount, tax, total,
        notes, business_day_id, store_session_id, created_by, idempotency_key)
      VALUES (?, ?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [number, supplier.id, purchaseDate, cleanText(input.supplierInvoice, null), subtotal, discount, tax, total,
      cleanText(input.notes, null), session?.business_day_id || null, session?.id || null, user.id, idempotencyKey]);
    const id = purchase.lastInsertRowid;

    for (const line of lines) {
      const newStock = Number(line.product.current_stock || 0) + line.quantity;
      await tx.run(`
        INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, unit_cost, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, line.product.id, line.product.name, line.quantity, line.unitCost, line.lineTotal]);
      await tx.run(
        `UPDATE salon_products SET current_stock = ?, ${updateCost ? 'purchase_price = ?,' : ''} updated_at = NOW() WHERE id = ?`,
        updateCost ? [newStock, line.unitCost, line.product.id] : [newStock, line.product.id]
      );
      await tx.run(`
        INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, notes, purchase_id)
        VALUES (?, 'stock_in', ?, ?, ?, ?, ?)
      `, [line.product.id, line.quantity, line.product.current_stock, newStock, `${number} from ${supplier.name}`, id]);
    }
    await logAction(tx, user.id, 'create', 'purchase', id, `${number} ${total}`);

    const paidNow = money(input.paidNow?.amount || 0, 'Amount paid now');
    if (paidNow > 0) {
      if (paidNow > total + 0.001) throw httpError('Amount paid now cannot exceed the purchase total');
      await insertPayment(tx, user, {
        supplier, purchaseId: id, amount: paidNow, method: String(input.paidNow.method || 'cash').toLowerCase(),
        paymentDate: purchaseDate, reference: input.paidNow.reference, notes: `Paid on ${number}`,
        allowOverdraw: input.paidNow.allowOverdraw, idempotencyKey: idempotencyKey ? `${idempotencyKey}:pay` : null,
      });
    }
    return id;
  });
  return { purchase: await getPurchase(db, purchaseId), duplicate: false };
}

export async function getPurchase(db, id) {
  const row = await db.get(`
    SELECT p.*, p.purchase_date::text AS purchase_day, s.name AS supplier_name, COALESCE(u.full_name, u.username) AS created_by_name
    FROM purchases p JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `, [id]);
  if (!row) throw httpError('Purchase not found', 404);
  const [items, payments] = await Promise.all([
    db.all('SELECT product_id, product_name, quantity, unit_cost, line_total FROM purchase_items WHERE purchase_id = ? ORDER BY id', [id]),
    db.all(`SELECT id, payment_number, amount, payment_method, payment_date::text AS payment_date, status FROM supplier_payments WHERE purchase_id = ? ORDER BY id`, [id]),
  ]);
  return {
    id: row.id,
    number: row.purchase_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    date: row.purchase_day,
    supplierInvoice: row.supplier_invoice,
    subtotal: round2(row.subtotal),
    discount: round2(row.discount),
    tax: round2(row.tax),
    total: round2(row.total),
    status: row.status,
    voidReason: row.void_reason,
    notes: row.notes,
    createdBy: row.created_by_name,
    createdAt: row.created_at,
    items: items.map((item) => ({
      productId: item.product_id, name: item.product_name, quantity: Number(item.quantity),
      unitCost: round2(item.unit_cost), lineTotal: round2(item.line_total),
    })),
    payments: payments.map((payment) => ({
      id: payment.id, number: payment.payment_number, amount: round2(payment.amount),
      method: payment.payment_method, date: payment.payment_date, status: payment.status,
    })),
    paidAgainst: round2(payments.filter((payment) => payment.status === 'ACTIVE').reduce((sum, payment) => sum + Number(payment.amount), 0)),
  };
}

export async function listPurchases(db, { from, to, supplierId = null } = {}) {
  const start = isIsoDate(from) ? from : null;
  const end = isIsoDate(to) ? to : null;
  const clauses = [];
  const params = [];
  if (start) { clauses.push('p.purchase_date >= ?::date'); params.push(start); }
  if (end) { clauses.push('p.purchase_date <= ?::date'); params.push(end); }
  if (supplierId) { clauses.push('p.supplier_id = ?'); params.push(supplierId); }
  const rows = await db.all(`
    SELECT p.id, p.purchase_number, p.purchase_date::text AS purchase_date, p.supplier_invoice, p.total, p.status,
           s.id AS supplier_id, s.name AS supplier_name,
           (SELECT COUNT(*)::int FROM purchase_items i WHERE i.purchase_id = p.id) AS lines,
           COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.purchase_id = p.id AND sp.status = 'ACTIVE'), 0) AS paid_against
    FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY p.purchase_date DESC, p.id DESC
    LIMIT 500
  `, params);
  const purchases = rows.map((row) => ({
    id: row.id, number: row.purchase_number, date: row.purchase_date, supplierInvoice: row.supplier_invoice,
    total: round2(row.total), status: row.status, supplierId: row.supplier_id, supplierName: row.supplier_name,
    lines: Number(row.lines || 0), paidAgainst: round2(row.paid_against),
  }));
  const received = purchases.filter((purchase) => purchase.status === 'RECEIVED');
  return {
    purchases,
    totals: { count: received.length, value: round2(received.reduce((sum, purchase) => sum + purchase.total, 0)) },
  };
}

export async function voidPurchase(db, user, id, reason) {
  const why = cleanText(reason, '');
  if (!why) throw httpError('A reason is required');
  return db.transaction(async (tx) => {
    const purchase = await tx.get('SELECT * FROM purchases WHERE id = ? FOR UPDATE', [id]);
    if (!purchase) throw httpError('Purchase not found', 404);
    if (purchase.status !== 'RECEIVED') throw httpError('This purchase is already void', 409);
    const balanceAfter = round2(await supplierBalance(tx, purchase.supplier_id) - Number(purchase.total));
    if (balanceAfter < -0.001) {
      throw httpError('Voiding this purchase would leave the supplier owing you money. Void the related payment first.', 409);
    }
    const items = await tx.all('SELECT product_id, quantity, product_name FROM purchase_items WHERE purchase_id = ?', [id]);
    for (const item of items) {
      const product = await tx.get('SELECT id, current_stock FROM salon_products WHERE id = ? FOR UPDATE', [item.product_id]);
      const newStock = Number(product.current_stock || 0) - Number(item.quantity);
      if (newStock < 0) throw httpError(`Only ${product.current_stock} of ${item.product_name} left in stock — the purchase can no longer be voided.`, 409);
      await tx.run('UPDATE salon_products SET current_stock = ?, updated_at = NOW() WHERE id = ?', [newStock, product.id]);
      await tx.run(`
        INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, notes, purchase_id)
        VALUES (?, 'stock_out', ?, ?, ?, ?, ?)
      `, [product.id, item.quantity, product.current_stock, newStock, `Void ${purchase.purchase_number}: ${why}`, id]);
    }
    await tx.run(`UPDATE purchases SET status = 'VOID', void_reason = ?, voided_at = NOW(), voided_by = ? WHERE id = ?`, [why, user.id, id]);
    await logAction(tx, user.id, 'void', 'purchase', id, why);
    return { id, voided: true };
  });
}

/* --------------------------------------------------------------- ledger */

/**
 * Supplier ledger: opening balance, then every purchase (owed +) and payment (owed −) in date
 * order with a running balance. Void entries are listed but do not move the balance.
 */
export async function getSupplierLedger(db, supplierId) {
  const supplier = await getSupplier(db, supplierId);
  const [purchases, payments] = await Promise.all([
    db.all(`
      SELECT id, purchase_number, purchase_date::text AS entry_date, total, status, supplier_invoice, created_at
      FROM purchases WHERE supplier_id = ?
    `, [supplierId]),
    db.all(`
      SELECT id, payment_number, payment_date::text AS entry_date, amount, payment_method, status, reference_number, created_at
      FROM supplier_payments WHERE supplier_id = ?
    `, [supplierId]),
  ]);
  const entries = [
    ...purchases.map((row) => ({
      kind: 'purchase', id: row.id, number: row.purchase_number, date: row.entry_date, createdAt: row.created_at,
      description: `Purchase${row.supplier_invoice ? ` · invoice ${row.supplier_invoice}` : ''}`,
      owedIncrease: row.status === 'RECEIVED' ? round2(row.total) : 0, owedDecrease: 0, amount: round2(row.total), status: row.status,
    })),
    ...payments.map((row) => ({
      kind: 'payment', id: row.id, number: row.payment_number, date: row.entry_date, createdAt: row.created_at,
      description: `Payment · ${row.payment_method}${row.reference_number ? ` · ${row.reference_number}` : ''}`,
      owedIncrease: 0, owedDecrease: row.status === 'ACTIVE' ? round2(row.amount) : 0, amount: round2(row.amount), status: row.status,
    })),
  ].sort((a, b) => (a.date === b.date ? new Date(a.createdAt) - new Date(b.createdAt) : a.date < b.date ? -1 : 1));

  let running = supplier.openingBalance;
  const ledger = entries.map((entry) => {
    running = round2(running + entry.owedIncrease - entry.owedDecrease);
    return { ...entry, balance: running };
  });
  return { supplier, openingBalance: supplier.openingBalance, entries: ledger, closingBalance: running };
}
