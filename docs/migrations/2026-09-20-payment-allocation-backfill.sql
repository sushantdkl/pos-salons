-- One-time, idempotent compatibility projection for invoices finalized before
-- canonical allocation rows existed. Original bill fields remain unchanged.
BEGIN;

INSERT INTO salon_payment_allocations (
  bill_id, method, amount, cash_tendered, change_amount, customer_id,
  business_day_id, store_session_id, created_by, idempotency_key, created_at
)
SELECT b.id, 'cash',
  CASE WHEN b.payment_method='cash' THEN b.grand_total ELSE b.cash_amount END,
  CASE WHEN b.payment_method='cash' THEN GREATEST(b.amount_paid,b.grand_total) ELSE b.cash_amount END,
  CASE WHEN b.payment_method='cash' THEN GREATEST(b.amount_paid-b.grand_total,0) ELSE 0 END,
  b.customer_id, b.business_day_id, b.store_session_id, b.cashier_id,
  'legacy-bill-' || b.id || '-cash', b.created_at
FROM salon_bills b
WHERE b.status='paid'
  AND (CASE WHEN b.payment_method='cash' THEN b.grand_total ELSE b.cash_amount END) > 0
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO salon_payment_allocations (
  bill_id, method, amount, provider, reference_number, change_amount,
  customer_id, business_day_id, store_session_id, created_by,
  idempotency_key, created_at
)
SELECT b.id, 'online',
  CASE WHEN b.payment_method IN ('online','card') THEN b.grand_total ELSE b.qr_amount END,
  CASE WHEN b.payment_method='card' THEN 'card' ELSE b.qr_type END,
  NULL, 0, b.customer_id, b.business_day_id, b.store_session_id, b.cashier_id,
  'legacy-bill-' || b.id || '-online', b.created_at
FROM salon_bills b
WHERE b.status='paid'
  AND (CASE WHEN b.payment_method IN ('online','card') THEN b.grand_total ELSE b.qr_amount END) > 0
ON CONFLICT (idempotency_key) DO NOTHING;

COMMIT;
