import { fromMinor, toMinor } from './money.js';

const ONLINE_ALIASES = new Set(['online', 'card', 'qr', 'bank', 'bank_transfer', 'cheque', 'fonepay', 'phonepay', 'esewa', 'khalti']);
export function canonicalPaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase().replace(/[ -]/g, '_');
  if (method === 'cash') return 'cash';
  if (method === 'credit') return 'credit';
  if (ONLINE_ALIASES.has(method)) return 'online';
  throw new Error(`Unsupported payment method: ${value || 'empty'}`);
}

export function normalizePaymentAllocations(data, grandTotal, options = {}) {
  const totalMinor = toMinor(grandTotal, 'Grand total');
  // A bill fully covered by a discount / loyalty reward settles with NO payment rows: nothing is
  // collected, so no cash or online payment may be invented for it.
  if (totalMinor === 0) {
    const offered = (Array.isArray(data.allocations) ? data.allocations : []).some((row) => Number(row?.amount || 0) > 0);
    if (offered) throw new Error('Payment allocations must equal the exact bill total');
    return { allocations: [], cashAmount: 0, onlineAmount: 0, creditAmount: 0, collectedAmount: 0, paymentMethod: 'cash', amountTendered: 0, changeAmount: 0 };
  }
  let raw = Array.isArray(data.allocations) ? data.allocations : null;
  if (!raw?.length) {
    const method = String(data.payment_method || 'cash').toLowerCase();
    if (method === 'split') raw = [
      { method: 'cash', amount: data.cash_amount, cashTendered: data.amount_paid || data.cash_amount },
      { method: 'online', amount: data.qr_amount, provider: data.qr_type, referenceNumber: data.reference_number },
    ].filter((row) => Number(row.amount || 0) > 0);
    else raw = [{ method, amount: grandTotal, cashTendered: data.amount_paid || grandTotal, provider: data.qr_type, referenceNumber: data.reference_number }];
  }
  const allocations = raw.map((row, index) => {
    const method = canonicalPaymentMethod(row.method);
    const amountMinor = toMinor(row.amount, `Allocation ${index + 1}`);
    if (amountMinor <= 0) throw new Error('Payment allocations must be greater than zero');
    let tenderedMinor = null; let changeMinor = 0;
    if (method === 'cash') {
      tenderedMinor = toMinor(row.cashTendered ?? row.cash_tendered ?? row.amount, 'Cash tendered');
      if (tenderedMinor < amountMinor) throw new Error('Cash tendered is less than the cash allocation');
      changeMinor = tenderedMinor - amountMinor;
    }
    if (method === 'credit' && !options.customerId) throw new Error('Credit requires an identified customer');
    return { method, amountMinor, amount: fromMinor(amountMinor), cashTendered: tenderedMinor == null ? null : fromMinor(tenderedMinor), change: fromMinor(changeMinor), provider: String(row.provider || '').trim() || null, referenceNumber: String(row.referenceNumber || row.reference_number || '').trim() || null };
  });
  if (allocations.reduce((sum, row) => sum + row.amountMinor, 0) !== totalMinor) throw new Error('Payment allocations must equal the exact bill total');
  const sums = (method) => fromMinor(allocations.filter((row) => row.method === method).reduce((sum, row) => sum + row.amountMinor, 0));
  const active = ['cash', 'online', 'credit'].filter((method) => sums(method) > 0);
  return { allocations, cashAmount: sums('cash'), onlineAmount: sums('online'), creditAmount: sums('credit'), collectedAmount: fromMinor(totalMinor - toMinor(sums('credit'))), paymentMethod: active.length === 1 ? active[0] : 'split', amountTendered: fromMinor(allocations.reduce((sum, row) => sum + (row.method === 'cash' ? toMinor(row.cashTendered) : row.amountMinor), 0)), changeAmount: fromMinor(allocations.reduce((sum, row) => sum + toMinor(row.change), 0)) };
}
