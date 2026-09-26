import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPaymentMethod, normalizePaymentAllocations } from '../../src/lib/payments/allocations.js';

test('provider-specific values normalize to online', () => {
  for (const value of ['card','QR','bank transfer','Fonepay','eSewa','Khalti']) assert.equal(canonicalPaymentMethod(value), 'online');
});

test('split allocations reconcile exactly in integer minor units', () => {
  const result = normalizePaymentAllocations({ allocations: [{ method:'cash',amount:'100.10',cashTendered:'110' },{ method:'online',amount:'200.20',provider:'eSewa' },{ method:'credit',amount:'0.03' }] }, '300.33', { customerId: 9 });
  assert.equal(result.cashAmount,100.1); assert.equal(result.onlineAmount,200.2); assert.equal(result.creditAmount,0.03); assert.equal(result.changeAmount,9.9);
});

test('invalid allocation, cash tender, and anonymous credit are rejected', () => {
  assert.throws(()=>normalizePaymentAllocations({allocations:[{method:'cash',amount:9,cashTendered:8}]},9),/less than/);
  assert.throws(()=>normalizePaymentAllocations({allocations:[{method:'credit',amount:9}]},9),/identified customer/);
  assert.throws(()=>normalizePaymentAllocations({allocations:[{method:'cash',amount:8}]},9),/exact bill total/);
});

test('legacy card and split payloads remain compatible', () => {
  assert.equal(normalizePaymentAllocations({payment_method:'card'},25).paymentMethod,'online');
  const split=normalizePaymentAllocations({payment_method:'split',cash_amount:10,qr_amount:15,qr_type:'BANK'},25);
  assert.equal(split.paymentMethod,'split'); assert.equal(split.onlineAmount,15);
});

test('a zero-total bill (fully discounted / loyalty reward) settles with no payment rows', () => {
  const result = normalizePaymentAllocations({ payment_method: 'cash', amount_paid: 0 }, 0);
  assert.equal(result.allocations.length, 0);
  assert.equal(result.cashAmount, 0); assert.equal(result.onlineAmount, 0); assert.equal(result.collectedAmount, 0);
  assert.throws(() => normalizePaymentAllocations({ allocations: [{ method: 'cash', amount: '10' }] }, 0), /exact bill total/);
});
