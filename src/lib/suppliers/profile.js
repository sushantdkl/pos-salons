/**
 * SUPPLIER PROFILE — everything the supplier page shows, computed here (server-side maths only):
 *   - invoice status: each payment is allocated to what it paid. A payment made with a purchase
 *     ("paid now") settles that purchase first; every other payment settles the oldest open
 *     invoice first (opening balance, then purchases by date). What is left open is on credit.
 *   - timeline: profile, opening balance, purchases, payments (with the invoices they covered)
 *     and voids, newest first, each live entry with the balance right after it.
 *   - items supplied, purchases, payments and the payable ledger (running balance).
 */

import { getSupplierLedger } from './service';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const EPS = 0.001;

function invoiceStatus(total, open) {
  if (open <= EPS) return 'PAID';
  if (open >= total - EPS) return 'CREDIT';
  return 'PARTIAL';
}

export async function getSupplierProfile(db, supplierId) {
  const ledger = await getSupplierLedger(db, supplierId);
  const { supplier } = ledger;
  const [meta, purchaseRows, itemRows, paymentRows] = await Promise.all([
    db.get('SELECT created_at FROM suppliers WHERE id = ?', [supplierId]),
    db.all(`
      SELECT p.id, p.purchase_number, p.purchase_date::text AS purchase_date, p.supplier_invoice, p.subtotal, p.discount, p.tax,
             p.total, p.status, p.notes, p.void_reason, p.voided_at, p.created_at,
             COALESCE(u.full_name, u.username) AS created_by_name
      FROM purchases p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.supplier_id = ?
      ORDER BY p.purchase_date, p.id
    `, [supplierId]),
    db.all(`
      SELECT i.purchase_id, i.product_id, i.product_name, i.quantity, i.unit_cost, i.line_total
      FROM purchase_items i JOIN purchases p ON p.id = i.purchase_id
      WHERE p.supplier_id = ?
      ORDER BY i.purchase_id, i.id
    `, [supplierId]),
    db.all(`
      SELECT sp.id, sp.payment_number, sp.payment_date::text AS payment_date, sp.amount, sp.payment_method, sp.status,
             sp.reference_number, sp.notes, sp.purchase_id, sp.void_reason, sp.voided_at, sp.created_at,
             COALESCE(u.full_name, u.username) AS created_by_name
      FROM supplier_payments sp LEFT JOIN users u ON u.id = sp.created_by
      WHERE sp.supplier_id = ?
      ORDER BY sp.payment_date, sp.created_at, sp.id
    `, [supplierId]),
  ]);

  const itemsByPurchase = new Map();
  for (const row of itemRows) {
    if (!itemsByPurchase.has(row.purchase_id)) itemsByPurchase.set(row.purchase_id, []);
    itemsByPurchase.get(row.purchase_id).push({
      productId: row.product_id, name: row.product_name, quantity: Number(row.quantity),
      unitCost: round2(row.unit_cost), lineTotal: round2(row.line_total),
    });
  }

  /* ---- allocation: opening balance + live purchases are the invoices */
  const invoices = [];
  if (supplier.openingBalance > 0) {
    invoices.push({ key: 'opening', purchaseId: null, label: 'Opening balance', total: supplier.openingBalance, open: supplier.openingBalance });
  }
  const invoiceByPurchase = new Map();
  for (const row of purchaseRows) {
    if (row.status !== 'RECEIVED') continue;
    const invoice = { key: `purchase-${row.id}`, purchaseId: row.id, label: row.purchase_number, total: round2(row.total), open: round2(row.total) };
    invoices.push(invoice);
    invoiceByPurchase.set(row.id, invoice);
  }
  const allocationsByPayment = new Map();
  const apply = (paymentId, invoice, amount) => {
    const applied = round2(Math.min(amount, invoice.open));
    if (applied <= EPS) return 0;
    invoice.open = round2(invoice.open - applied);
    if (!allocationsByPayment.has(paymentId)) allocationsByPayment.set(paymentId, []);
    allocationsByPayment.get(paymentId).push({ purchaseId: invoice.purchaseId, recordId: invoice.purchaseId, label: invoice.label, amount: applied });
    return applied;
  };
  const livePayments = paymentRows.filter((row) => row.status === 'ACTIVE');
  const leftover = new Map();
  // 1) "Paid now" payments settle their own purchase.
  for (const row of livePayments) {
    let remaining = round2(row.amount);
    const own = row.purchase_id ? invoiceByPurchase.get(row.purchase_id) : null;
    if (own) remaining = round2(remaining - apply(row.id, own, remaining));
    leftover.set(row.id, remaining);
  }
  // 2) Everything else settles the oldest open invoice first.
  for (const row of livePayments) {
    let remaining = leftover.get(row.id);
    for (const invoice of invoices) {
      if (remaining <= EPS) break;
      remaining = round2(remaining - apply(row.id, invoice, remaining));
    }
  }

  const paidNowByPurchase = new Map();
  for (const row of livePayments) {
    if (!row.purchase_id) continue;
    const current = paidNowByPurchase.get(row.purchase_id) || { amount: 0, methods: new Set() };
    current.amount = round2(current.amount + Number(row.amount));
    current.methods.add(row.payment_method);
    paidNowByPurchase.set(row.purchase_id, current);
  }

  const purchases = purchaseRows.map((row) => {
    const invoice = invoiceByPurchase.get(row.id);
    const total = round2(row.total);
    const paidNow = paidNowByPurchase.get(row.id);
    let terms = 'Credit';
    if (paidNow?.amount >= total - EPS) terms = `Paid ${[...paidNow.methods].join(' + ')}`;
    else if (paidNow?.amount > 0) terms = `Part paid ${[...paidNow.methods].join(' + ')} · rest on credit`;
    const open = invoice ? invoice.open : 0;
    return {
      id: row.id, number: row.purchase_number, date: row.purchase_date, supplierInvoice: row.supplier_invoice,
      subtotal: round2(row.subtotal), discount: round2(row.discount), tax: round2(row.tax), total,
      status: row.status, paymentStatus: row.status === 'VOID' ? 'VOID' : invoiceStatus(total, open),
      terms, paidNow: paidNow?.amount || 0, paid: invoice ? round2(total - open) : 0, open,
      notes: row.notes, voidReason: row.void_reason, voidedAt: row.voided_at, createdAt: row.created_at,
      receivedBy: row.created_by_name, items: itemsByPurchase.get(row.id) || [],
    };
  });

  const payments = paymentRows.map((row) => ({
    id: row.id, number: row.payment_number, date: row.payment_date, amount: round2(row.amount), method: row.payment_method,
    status: row.status, reference: row.reference_number, notes: row.notes, purchaseId: row.purchase_id,
    voidReason: row.void_reason, voidedAt: row.voided_at, createdAt: row.created_at, paidBy: row.created_by_name,
    allocations: allocationsByPayment.get(row.id) || [],
  }));

  /* ---- items supplied (live purchases only) */
  const itemMap = new Map();
  for (const purchase of purchases) {
    if (purchase.status !== 'RECEIVED') continue;
    for (const item of purchase.items) {
      const current = itemMap.get(item.productId) || { productId: item.productId, name: item.name, deliveries: 0, quantity: 0, totalValue: 0, lastReceived: null, lastUnitCost: 0 };
      current.deliveries += 1;
      current.quantity += item.quantity;
      current.totalValue = round2(current.totalValue + item.lineTotal);
      if (!current.lastReceived || purchase.date >= current.lastReceived) {
        current.lastReceived = purchase.date;
        current.lastUnitCost = item.unitCost;
      }
      itemMap.set(item.productId, current);
    }
  }
  const items = [...itemMap.values()].sort((a, b) => b.totalValue - a.totalValue);

  /* ---- timeline */
  const balanceAfter = new Map(ledger.entries.map((entry) => [`${entry.kind}-${entry.id}`, entry.balance]));
  const itemSummary = (list) => list.map((item) => `${item.name} × ${item.quantity}`).join(', ');
  const timeline = [];
  timeline.push({ id: 'profile', at: meta?.created_at, kind: 'profile', tone: 'neutral', title: 'Supplier profile created', description: supplier.name });
  if (supplier.openingBalance > 0) {
    timeline.push({
      id: 'opening', at: meta?.created_at, kind: 'credit', tone: 'charge', title: 'Opening balance',
      description: 'Amount already owed when the supplier was added.', amount: supplier.openingBalance, amountLabel: 'Owed', balance: supplier.openingBalance,
    });
  }
  for (const purchase of purchases) {
    timeline.push({
      id: `purchase-${purchase.id}`, at: purchase.createdAt, effectiveDate: purchase.date, kind: 'purchase',
      tone: purchase.status === 'VOID' ? 'neutral' : 'charge',
      title: `Purchase received · ${purchase.number}`,
      description: itemSummary(purchase.items) || purchase.notes || 'No item details recorded',
      amount: purchase.total, amountLabel: 'Purchase total',
      balance: purchase.status === 'RECEIVED' ? balanceAfter.get(`purchase-${purchase.id}`) : null,
      status: purchase.paymentStatus,
      meta: [purchase.terms, purchase.supplierInvoice ? `Invoice ${purchase.supplierInvoice}` : null, purchase.receivedBy ? `Received by ${purchase.receivedBy}` : null].filter(Boolean),
      recordId: purchase.id,
    });
    if (purchase.status === 'VOID') {
      timeline.push({
        id: `purchase-void-${purchase.id}`, at: purchase.voidedAt, kind: 'adjustment', tone: 'neutral',
        title: `Purchase voided · ${purchase.number}`, description: purchase.voidReason || 'Voided', amount: purchase.total, amountLabel: 'Removed from payable',
        recordId: purchase.id,
      });
    }
  }
  for (const payment of payments) {
    timeline.push({
      id: `payment-${payment.id}`, at: payment.createdAt, effectiveDate: payment.date, kind: 'payment',
      tone: payment.status === 'VOID' ? 'neutral' : 'payment',
      title: `Payment made · ${payment.number}`,
      description: [payment.method === 'cash' ? 'Cash from drawer' : 'Online / bank', payment.reference, payment.notes].filter(Boolean).join(' · '),
      amount: payment.amount, amountLabel: 'Paid',
      balance: payment.status === 'ACTIVE' ? balanceAfter.get(`payment-${payment.id}`) : null,
      status: payment.status === 'VOID' ? 'VOID' : null,
      meta: [payment.paidBy ? `By ${payment.paidBy}` : null].filter(Boolean),
      allocations: payment.allocations,
    });
    if (payment.status === 'VOID') {
      timeline.push({
        id: `payment-void-${payment.id}`, at: payment.voidedAt, kind: 'adjustment', tone: 'neutral',
        title: `Payment voided · ${payment.number}`, description: payment.voidReason || 'Voided', amount: payment.amount, amountLabel: 'Added back to payable',
      });
    }
  }
  timeline.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

  const livePurchases = purchases.filter((purchase) => purchase.status === 'RECEIVED');
  const openInvoices = invoices.filter((invoice) => invoice.open > EPS).map((invoice) => ({
    purchaseId: invoice.purchaseId, label: invoice.label, total: invoice.total, open: invoice.open,
  }));

  return {
    ...ledger,
    supplier: { ...supplier, createdAt: meta?.created_at || null },
    summary: {
      totalSpend: round2(livePurchases.reduce((sum, purchase) => sum + purchase.total, 0)),
      outstanding: ledger.closingBalance,
      totalPaid: round2(livePayments.reduce((sum, row) => sum + Number(row.amount), 0)),
      purchases: livePurchases.length,
      voidedPurchases: purchases.length - livePurchases.length,
      openInvoices: openInvoices.length,
      itemsSupplied: items.length,
    },
    openInvoices,
    purchases: [...purchases].reverse(),
    payments: [...payments].reverse(),
    items,
    timeline,
  };
}
