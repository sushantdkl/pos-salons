import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { PHONE_ERROR_MESSAGE, phoneOrNull } from '@/lib/validation/phone';
import { requireOpenSession } from '@/lib/business-day/service';
import { salonDateString } from '@/lib/reports/dashboard-period';
import { randomUUID } from 'node:crypto';
import { normalizePaymentAllocations } from '@/lib/payments/allocations';
import { PERMISSIONS, hasPermission, requirePermission } from '@/lib/auth/permissions';
import { normalizeDocumentSettings } from '@/lib/documents/settings';
import { linkAppointmentToBill } from '@/lib/appointments/service';
import {
  awardBill, billHasEligibleLines, createClaimCode, customerBalances, getCrmSettings, planRedemption, recordRedemption,
} from '@/lib/loyalty/service';

function normalizeDiscount(type, value, subtotal) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Discount cannot be negative');
  if (type === 'percentage') {
    if (amount > 100) throw new Error('Percentage discount cannot exceed 100');
    return (subtotal * amount) / 100;
  }
  if (amount > subtotal) throw new Error('Discount cannot exceed subtotal');
  return amount;
}

function money(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) throw new Error('Invalid payment amount');
  return Math.round(parsed * 100) / 100;
}

function normalizePayment(data, grandTotal) {
  const total = money(grandTotal);
  const paymentMethod = ['cash', 'card', 'online', 'split'].includes(data.payment_method) ? data.payment_method : 'cash';
  const qrType = ['ESEWA_PHONEPAY', 'BANK'].includes(data.qr_type) ? data.qr_type : null;
  let cashAmount = 0;
  let qrAmount = 0;
  // amountTendered is what the customer handed over (cash may exceed the bill, and the
  // receipt prints the change). totalPaid is what the salon actually collected, and it
  // always equals cash + QR = final bill total.
  let amountTendered = total;

  if (paymentMethod === 'cash') {
    amountTendered = money(data.amount_paid || total);
    if (amountTendered < total) throw new Error('Amount paid is less than total');
    cashAmount = total;
  } else if (paymentMethod === 'online') {
    if (!qrType) throw new Error('Select QR type for online payment');
    qrAmount = total;
  } else if (paymentMethod === 'card') {
    // Card settles to the salon's bank account, so it belongs with online collection.
    qrAmount = total;
  } else if (paymentMethod === 'split') {
    cashAmount = money(data.cash_amount);
    qrAmount = money(data.qr_amount);
    if (qrAmount > 0 && !qrType) throw new Error('Select QR type for split payment');
    if (cashAmount < 0) throw new Error('Cash amount cannot be negative');
    if (qrAmount < 0) throw new Error('QR amount cannot be negative');
    if (cashAmount > total) throw new Error('Cash amount cannot exceed total payable');
    if (qrAmount > total) throw new Error('QR amount cannot exceed total payable');
    if (Math.abs((cashAmount + qrAmount) - total) > 0.01) {
      throw new Error('Cash amount and QR amount must equal total payable');
    }
  }

  return {
    paymentMethod,
    cashAmount: money(cashAmount),
    qrAmount: money(qrAmount),
    qrType: paymentMethod === 'online' || (paymentMethod === 'split' && qrAmount > 0) ? qrType : null,
    amountTendered: money(amountTendered),
    totalPaid: money(cashAmount + qrAmount),
    paymentStatus: 'paid',
  };
}

/**
 * A bill carries TWO independent attributions and they must never be conflated:
 *
 *   transaction_time / revenue_business_day_id -> when the SALE happened, i.e. whose revenue
 *   business_day_id / store_session_id / payment_received_at -> where the CASH landed
 *
 * For an ordinary bill both point at the current business day. For a backdated Admin bill
 * the service happened earlier, so its revenue belongs to that earlier business day (or to
 * no business day at all, when the salon was not operating a Business Day back then) while
 * its money is physically in today's drawer and must reconcile against today's session.
 */
function resolveTransactionAudit(data, user) {
  const now = new Date();
  const requested = cleanText(data.transaction_time || data.transactionTime, '');
  if (!requested) {
    return {
      transactionTime: now.toISOString(),
      backdatedBy: null,
      backdatedReason: null,
      isBackdated: false,
    };
  }

  if (user.role !== 'admin') {
    const error = new Error('Only Admin can set a historical transaction date.');
    error.status = 403;
    throw error;
  }

  const selectedDate = new Date(requested);
  if (Number.isNaN(selectedDate.getTime())) throw new Error('Invalid transaction date and time');
  if (selectedDate.getTime() > now.getTime() + 60_000) throw new Error('Future transaction dates are not allowed');

  const reason = cleanText(data.backdated_reason || data.backdatedReason, '');
  if (!reason) throw new Error('Reason for historical entry is required');

  return {
    transactionTime: selectedDate.toISOString(),
    backdatedBy: user.id,
    backdatedReason: reason,
    // An explicit transaction time was supplied. Whether that makes the sale HISTORICAL is
    // decided against the open business day, not the calendar — see below.
    requestedTime: true,
  };
}

/**
 * The business day that OWNS a sale.
 *
 * The comparison is against the OPEN BUSINESS DAY's date, never the calendar date: the two
 * differ whenever a session runs past midnight or a business day is dated ahead of the
 * calendar, and using the calendar there would push a historical sale onto the current
 * operational day (or vice versa).
 *
 *   service date == current business date -> the current day owns it (a bill for today with
 *                                            a chosen time is not a historical sale)
 *   service date != current business date -> the business day for that date owns it, or NULL
 *                                            when the salon ran no business day then. NULL
 *                                            excludes it from every business-day revenue
 *                                            figure and leaves it to the calendar reports on
 *                                            its real date, which is where it belongs.
 *
 * The cash always stays with the session that physically received it.
 */
async function resolveRevenueBusinessDayId(tx, transactionAudit, currentBusinessDayId, currentBusinessDate) {
  if (!transactionAudit.requestedTime) return currentBusinessDayId;
  const saleDate = salonDateString(new Date(transactionAudit.transactionTime));
  if (currentBusinessDate && saleDate === currentBusinessDate) return currentBusinessDayId;
  const day = await tx.get('SELECT id FROM business_days WHERE business_date = ?::date LIMIT 1', [saleDate]);
  return day?.id || null;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);
    const bills = await db.all(`
      SELECT b.*, u.full_name AS cashier_name, COUNT(i.id)::int as item_count
      FROM salon_bills b
      LEFT JOIN salon_bill_items i ON i.bill_id = b.id
      LEFT JOIN users u ON u.id = b.cashier_id
      GROUP BY b.id, u.full_name
      ORDER BY b.created_at DESC
      LIMIT 100
    `);
    return NextResponse.json({ bills });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch bills' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requirePermission(request, db, PERMISSIONS.BILLING_CREATE);
    const data = await request.json();
    const idempotencyKey = cleanText(request.headers.get('idempotency-key') || data.idempotency_key, '') || randomUUID();
    const existing = await db.get('SELECT * FROM salon_bills WHERE idempotency_key = ?', [idempotencyKey]);
    if (existing) {
      const items = await db.all('SELECT * FROM salon_bill_items WHERE bill_id = ? ORDER BY id', [existing.id]);
      return NextResponse.json({ message: 'Bill already completed', bill: existing, items, duplicate: true }, { status: 200 });
    }
    // A bill is drawer money, so it may only be recorded while the store is open.
    const { sessionId, businessDayId, session } = await requireOpenSession(db);
    // The operational date of the open business day, normalised to 'YYYY-MM-DD'. node-postgres
    // returns a DATE as a JS Date at LOCAL midnight, so its local Y/M/D is the intended date.
    const currentBusinessDate = session?.business_date instanceof Date
      ? `${session.business_date.getFullYear()}-${String(session.business_date.getMonth() + 1).padStart(2, '0')}-${String(session.business_date.getDate()).padStart(2, '0')}`
      : String(session?.business_date || '').slice(0, 10) || null;
    const services = Array.isArray(data.services) ? data.services : [];
    const products = Array.isArray(data.products) ? data.products : [];
    const shouldPrint = Boolean(data.should_print);
    const transactionAudit = resolveTransactionAudit(data, user);
    if (services.length === 0 && products.length === 0) {
      return NextResponse.json({ error: 'Add at least one service or product' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      let customerId = data.customer_id || null;
      const tokenId = Number(data.token_id || 0) || null;
      let linkedToken = null;
      if (tokenId) {
        linkedToken = await tx.get(`
          SELECT id, token_number, status, invoice_id, customer_id, customer_name, customer_phone
          FROM walk_in_tokens
          WHERE id = ?
          FOR UPDATE
        `, [tokenId]);
        if (!linkedToken) {
          const error = new Error('Selected token was not found');
          error.status = 404;
          throw error;
        }
        if (linkedToken.invoice_id || linkedToken.status === 'BILLED') {
          const error = new Error('This token has already been billed.');
          error.status = 409;
          throw error;
        }
        if (['CANCELLED', 'NO_SHOW'].includes(linkedToken.status)) {
          const error = new Error('This token cannot be billed because it is no longer active.');
          error.status = 422;
          throw error;
        }
        if (linkedToken.status !== 'WAITING') {
          const error = new Error('Only waiting tokens can be billed');
          error.status = 422;
          throw error;
        }
      }
      const customerName = cleanText(data.customer?.name || data.customer_name || 'Walk-in Customer');
      const rawPhone = data.customer?.phone || data.customer_phone;
      const customerPhone = String(rawPhone || '').trim() ? phoneOrNull(rawPhone) : null;
      if (String(rawPhone || '').trim() && !customerPhone) throw new Error(PHONE_ERROR_MESSAGE);

      if (!customerId && customerPhone) {
        const existing = await tx.get('SELECT id FROM customers WHERE phone = ?', [customerPhone]);
        if (existing) {
          customerId = existing.id;
          await tx.run('UPDATE customers SET name = ?, updated_at = NOW() WHERE id = ?', [customerName, customerId]);
        } else {
          const customerResult = await tx.run(
            'INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)',
            [customerName, customerPhone, cleanText(data.customer?.notes, null)]
          );
          customerId = customerResult.lastInsertRowid;
        }
      }

      const serviceRows = [];
      for (const item of services) {
        const service = await tx.get('SELECT * FROM salon_services WHERE id = ? AND is_active = TRUE', [item.id]);
        if (!service) throw new Error(`Service unavailable: ${item.name || item.id}`);
        const staffId = Number(item.staff_id || 0) || null;
        if (!staffId) throw new Error(`Assign staff for ${service.name}`);
        const staffProfile = await tx.get(`
          SELECT sp.salon_role, sp.commission_percentage, sp.assigned_services,
                 COALESCE(NULLIF(sp.display_name, ''), u.full_name) as staff_name
          FROM staff_profiles sp
          JOIN users u ON u.id = sp.user_id
          WHERE sp.user_id = ? AND u.is_active = TRUE AND sp.salon_role IN ('barber', 'stylist', 'beautician')
        `, [staffId]);
        if (!staffProfile) throw new Error(`Selected staff cannot perform ${service.name}`);
        // Assigned-services is guidance for the UI, not a hard billing block —
        // cashier/admin may assign whoever actually did the work.
        const commissionPercentage = Number(staffProfile?.commission_percentage || 0);
        serviceRows.push({
          item_type: 'service',
          item_id: service.id,
          name: service.name,
          quantity: 1,
          unit_price: Number(service.price),
          subtotal: Number(service.price),
          staff_id: staffId,
          staff_name_snapshot: staffProfile.staff_name,
          staff_role: staffProfile.salon_role,
          commission_percentage: commissionPercentage,
          commission_amount: Number(service.price) * commissionPercentage / 100,
        });
      }

      const productRows = [];
      for (const item of products) {
        const product = await tx.get('SELECT * FROM salon_products WHERE id = ? AND status = ? FOR UPDATE', [item.id, 'active']);
        if (!product) throw new Error(`Product unavailable: ${item.name || item.id}`);
        const quantity = Number(item.quantity || 1);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid quantity for ${product.name}`);
        if (product.current_stock < quantity) throw new Error(`Not enough stock for ${product.name}`);
        productRows.push({
          item_type: 'product',
          item_id: product.id,
          name: product.name,
          quantity,
          unit_price: Number(product.selling_price),
          subtotal: Number(product.selling_price) * quantity,
          staff_id: null,
          commission_percentage: 0,
          commission_amount: 0,
          unit_cost_snapshot: Number(product.purchase_price || 0),
          previous_stock: product.current_stock,
          new_stock: product.current_stock - quantity,
        });
      }

      const items = [...serviceRows, ...productRows];
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const discountType = data.discount_type === 'percentage' ? 'percentage' : 'amount';
      const discountAmount = normalizeDiscount(discountType, data.discount_value || data.discount_amount, subtotal);
      // Loyalty reward chosen by the cashier: validated against the ledger here (customer locked).
      // It is a DISCOUNT on the bill — stored inside discount_amount (so gross − discount = net
      // holds in every report) and separately as loyalty_discount. No payment is created for it.
      const redeemProgramId = Number(data.loyalty_redemption?.programId || 0) || null;
      const loyalty = redeemProgramId
        ? await planRedemption(tx, { customerId, programId: redeemProgramId, serviceRows, amountAfterDiscount: subtotal - discountAmount })
        : null;
      if (loyalty && loyalty.rewardIndex >= 0) serviceRows[loyalty.rewardIndex].loyalty_reward = true;
      const loyaltyDiscount = loyalty ? loyalty.discount : 0;
      const taxable = subtotal - discountAmount - loyaltyDiscount;
      const taxPercent = Number(data.tax_percent || 0);
      if (taxPercent < 0 || taxPercent > 100) throw new Error('Invalid tax percentage');
      const tax = taxable * taxPercent / 100;
      const serviceCharge = Number(data.service_charge || 0);
      if (serviceCharge < 0) throw new Error('Service charge cannot be negative');
      const grandTotal = taxable + tax + serviceCharge;
      const payment = normalizePaymentAllocations(data, grandTotal, { customerId });
      if (payment.creditAmount > 0) {
        if (!(await hasPermission(tx, user, PERMISSIONS.BILLING_CREDIT_CREATE))) {
          const error = new Error('Credit billing is not permitted'); error.status = 403; throw error;
        }
        const customer = await tx.get('SELECT id, credit_limit FROM customers WHERE id = ? FOR UPDATE', [customerId]);
        if (!customer) throw new Error('Credit requires an identified customer');
        const balance = await tx.get('SELECT COALESCE(SUM(debit-credit),0) AS balance FROM customer_credit_ledger WHERE customer_id = ?', [customerId]);
        const projected = Number(balance?.balance || 0) + payment.creditAmount;
        if (projected > Number(customer.credit_limit || 0)) {
          const canOverride = await hasPermission(tx, user, PERMISSIONS.BILLING_CREDIT_OVERRIDE);
          if (!canOverride || !data.credit_override_reason) throw new Error('Customer credit limit would be exceeded');
        }
      }

      const sequence = await tx.get(`INSERT INTO document_sequences(document_type, next_value) VALUES ('salon_bill', 2) ON CONFLICT(document_type) DO UPDATE SET next_value=document_sequences.next_value + 1, updated_at=NOW() RETURNING next_value - 1 AS value`);
      const billNumber = `SALON-${String(sequence.value).padStart(7, '0')}`;
      const settingRows = await tx.all('SELECT setting_key, setting_value FROM system_settings');
      const documentSnapshot = normalizeDocumentSettings(Object.fromEntries(settingRows.map((row) => [row.setting_key, row.setting_value])));
      // Revenue day vs cash day. These differ only for a genuinely backdated Admin bill.
      const revenueBusinessDayId = await resolveRevenueBusinessDayId(tx, transactionAudit, businessDayId, currentBusinessDate);
      const billResult = await tx.run(`
        INSERT INTO salon_bills (
          bill_number, customer_id, customer_name, customer_phone, subtotal,
          discount_amount, discount_type, tax, tax_percent, service_charge,
          grand_total, payment_method, amount_paid, cash_amount, qr_amount,
          qr_type, total_paid, payment_status, cashier_id, token_id,
          transaction_time, is_printed, printed_at, printed_by,
          backdated_by, backdated_reason, notes, business_day_id, store_session_id,
          revenue_business_day_id, payment_received_at, idempotency_key, credit_amount, document_snapshot,
          loyalty_discount, loyalty_program_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamptz, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamptz, ?, ?, ?::jsonb, ?, ?)
      `, [
        billNumber,
        customerId,
        customerName,
        customerPhone,
        subtotal,
        discountAmount + loyaltyDiscount,
        discountType,
        tax,
        taxPercent,
        serviceCharge,
        grandTotal,
        payment.paymentMethod,
        payment.amountTendered,
        payment.cashAmount,
        payment.onlineAmount,
        ['ESEWA_PHONEPAY', 'BANK'].includes(payment.allocations.find((row) => row.method === 'online')?.provider)
          ? payment.allocations.find((row) => row.method === 'online')?.provider : null,
        payment.collectedAmount,
        payment.creditAmount === grandTotal ? 'credit' : payment.creditAmount > 0 ? 'partial' : 'paid',
        user.id,
        tokenId,
        transactionAudit.transactionTime,
        shouldPrint,
        shouldPrint ? new Date().toISOString() : null,
        shouldPrint ? user.id : null,
        transactionAudit.backdatedBy,
        transactionAudit.backdatedReason,
        cleanText(data.notes, null),
        businessDayId,
        sessionId,
        revenueBusinessDayId,
        // The money is taken now, whatever date the service carries.
        new Date().toISOString(),
        idempotencyKey,
        payment.creditAmount,
        JSON.stringify(documentSnapshot),
        loyaltyDiscount,
        loyalty ? loyalty.program.id : null,
      ]);

      const billId = billResult.lastInsertRowid;
      for (const item of items) {
        const itemResult = await tx.run(`
          INSERT INTO salon_bill_items (
            bill_id, item_type, item_id, name, quantity, unit_price,
            subtotal, staff_id, staff_name_snapshot, commission_percentage, commission_amount, unit_cost_snapshot, loyalty_reward
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          billId, item.item_type, item.item_id, item.name, item.quantity, item.unit_price,
          item.subtotal, item.staff_id, item.staff_name_snapshot || null, item.commission_percentage, item.commission_amount, item.unit_cost_snapshot ?? null,
          Boolean(item.loyalty_reward),
        ]);
        item.id = itemResult.lastInsertRowid;
        if (item.item_type === 'product') {
          await tx.run('UPDATE salon_products SET current_stock = ?, updated_at = NOW() WHERE id = ?', [item.new_stock, item.item_id]);
          await tx.run(`
            INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, notes)
            VALUES (?, 'sale', ?, ?, ?, ?)
          `, [item.item_id, item.quantity, item.previous_stock, item.new_stock, billNumber]);
        }
      }

      for (let index = 0; index < payment.allocations.length; index += 1) {
        const allocation = payment.allocations[index];
        const allocationResult = await tx.run(`INSERT INTO salon_payment_allocations (bill_id, method, amount, provider, reference_number, cash_tendered, change_amount, customer_id, business_day_id, store_session_id, created_by, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [billId, allocation.method, allocation.amount, allocation.provider, allocation.referenceNumber, allocation.cashTendered, allocation.change, allocation.method === 'credit' ? customerId : null, businessDayId, sessionId, user.id, `${idempotencyKey}:${index}`]);
        if (allocation.method === 'credit') {
          await tx.run(`INSERT INTO customer_credit_ledger(customer_id, bill_id, allocation_id, entry_type, debit, credit, note, business_day_id, created_by, idempotency_key) VALUES (?, ?, ?, 'credit_sale', ?, 0, ?, ?, ?, ?)`, [customerId, billId, allocationResult.lastInsertRowid, allocation.amount, cleanText(data.credit_note, 'Invoice credit'), businessDayId, user.id, `${idempotencyKey}:credit:${index}`]);
        }
      }

      // Loyalty, in this same transaction: the reward is consumed (REDEEM), then this bill's
      // eligible paid lines earn (EARN, once each). A walk-in bill gets a one-time claim code instead.
      if (loyalty) {
        await recordRedemption(tx, {
          customerId, program: loyalty.program, billId, balance: loyalty.balance, actorId: user.id,
          billItemId: loyalty.rewardIndex >= 0 ? serviceRows[loyalty.rewardIndex].id : null,
        });
      }
      let loyaltyClaimCode = null;
      const crm = await getCrmSettings(tx);
      if (customerId) {
        await awardBill(tx, { billId, customerId, source: 'POS', actorId: user.id });
      } else {
        if (crm.claimCodesEnabled && payment.creditAmount === 0 && await billHasEligibleLines(tx, billId)) {
          loyaltyClaimCode = await createClaimCode(tx, billId, crm.claimCodeValidDays);
        }
      }
      const loyaltyProgress = customerId
        ? (await customerBalances(tx, customerId)).filter((row) => row.enrolled || row.available > 0).map((row) => ({
          programId: row.programId, name: row.name, progress: row.progress, requiredVisits: row.requiredVisits, available: row.available, remaining: row.remaining, rewardLabel: row.rewardLabel,
        }))
        : [];

      if (customerId) {
        const serviceNames = serviceRows.map((item) => item.name).join(', ');
        const preferred = serviceRows.reduce((acc, item) => {
          if (item.staff_role === 'barber' && !acc.barber) acc.barber = item.staff_id;
          if (item.staff_role === 'stylist' && !acc.stylist) acc.stylist = item.staff_id;
          if (item.staff_role === 'beautician' && !acc.beautician) acc.beautician = item.staff_id;
          return acc;
        }, {});
        await tx.run(`
          UPDATE customers
          SET total_visits = COALESCE(total_visits, 0) + 1,
              total_spent = COALESCE(total_spent, 0) + ?,
              favorite_services = CASE
                WHEN ? = '' THEN favorite_services
                WHEN favorite_services IS NULL OR favorite_services = '' THEN ?
                ELSE favorite_services || ', ' || ?
              END,
              preferred_barber_id = COALESCE(?, preferred_barber_id),
              preferred_stylist_id = COALESCE(?, preferred_stylist_id),
              preferred_beautician_id = COALESCE(?, preferred_beautician_id),
              customer_category = CASE
                WHEN COALESCE(total_spent, 0) + ? >= 50000 THEN 'VIP Customer'
                WHEN COALESCE(total_visits, 0) + 1 >= 2 THEN 'Returning Customer'
                ELSE 'New Customer'
              END,
              updated_at = NOW()
          WHERE id = ?
        `, [
          grandTotal, serviceNames, serviceNames, serviceNames,
          preferred.barber || null, preferred.stylist || null, preferred.beautician || null,
          grandTotal, customerId,
        ]);
      }

      await logAction(tx, user.id, shouldPrint ? 'create_printed' : 'create', 'bill', billId, billNumber);

      if (tokenId) {
        const tokenUpdate = await tx.run(`
          UPDATE walk_in_tokens
          SET status = 'BILLED', billed_at = ?::timestamptz, invoice_id = ?, updated_at = NOW()
          WHERE id = ? AND status = 'WAITING' AND invoice_id IS NULL
        `, [transactionAudit.transactionTime, billId, tokenId]);
        if (Number(tokenUpdate.rowCount || 0) !== 1) {
          const error = new Error('Unable to complete the token-linked bill. No transaction was saved. Please try again.');
          error.status = 409;
          throw error;
        }
      }

      // Settling an appointment: linked inside this transaction, so a bill is never saved
      // without its link (or twice for the same appointment — the paid-bill index guards it).
      const appointmentId = Number(data.appointment_id || data.appointmentId || 0) || null;
      if (appointmentId) await linkAppointmentToBill(tx, appointmentId, billId, user.id);

      return {
        bill: {
          id: billId,
          bill_number: billNumber,
          customer_id: customerId,
          customer_name: customerName,
          customer_phone: customerPhone,
          subtotal,
          discount_amount: discountAmount + loyaltyDiscount,
          loyalty_discount: loyaltyDiscount,
          loyalty_reward_label: loyalty ? loyalty.program.rewardLabel : null,
          loyalty_progress: loyaltyProgress,
          loyalty_claim_code: loyaltyClaimCode,
          review_rewards_qr: crm.receiptQrEnabled,
          discount_type: discountType,
          tax,
          tax_percent: taxPercent,
          service_charge: serviceCharge,
          grand_total: grandTotal,
          payment_method: payment.paymentMethod,
          amount_paid: payment.amountTendered,
          cash_amount: payment.cashAmount,
          qr_amount: payment.onlineAmount,
          credit_amount: payment.creditAmount,
          qr_type: payment.allocations.find((row) => row.method === 'online')?.provider || null,
          total_paid: payment.collectedAmount,
          payment_status: payment.creditAmount === grandTotal ? 'credit' : payment.creditAmount > 0 ? 'partial' : 'paid',
          cashier_name: user.full_name || user.username || null,
          document_snapshot: documentSnapshot,
          token_id: tokenId,
          token_number: linkedToken?.token_number || null,
          is_printed: shouldPrint,
          printed_at: shouldPrint ? new Date().toISOString() : null,
          printed_by: shouldPrint ? user.id : null,
          transaction_time: transactionAudit.transactionTime,
          created_at: new Date().toISOString(),
        },
        items,
      };
    });

    return NextResponse.json({ message: 'Bill completed successfully', ...result }, { status: 201 });
  } catch (error) {
    const knownMessages = [
      PHONE_ERROR_MESSAGE,
      'Add at least one service or product',
      'This token has already been billed.',
      'This token cannot be billed because it is no longer active.',
      'Unable to complete the token-linked bill. No transaction was saved. Please try again.',
      'Only waiting tokens can be billed',
      'Amount paid is less than total',
      'Cash amount and QR amount must equal total payable',
      'Select QR type for split payment',
      'Select QR type for online payment',
      'Reason for historical entry is required',
      'Future transaction dates are not allowed',
      'Only Admin can set a historical transaction date.',
    ];
    if (error.code === 'STORE_CLOSED') {
      return NextResponse.json({ error: error.message, message: error.message, code: error.code, success: false }, { status: 409 });
    }
    // Appointment link: already billed / cancelled / missing, or the paid-bill unique index.
    if (error.code === 'APPOINTMENT_ALREADY_BILLED' || error.constraint === 'ux_salon_bills_appointment_paid') {
      const message = error.code === 'APPOINTMENT_ALREADY_BILLED' ? error.message : 'This appointment is already billed.';
      return NextResponse.json({ error: message, message, code: 'APPOINTMENT_ALREADY_BILLED', success: false }, { status: 409 });
    }
    // Loyalty reward problems (no reward, reward service not on the bill…) carry their own status.
    if (['NO_REWARD', 'REWARD_SERVICE_MISSING'].includes(error.code) || (/loyalty|reward/i.test(error.message || '') && error.status && error.status < 500)) {
      return NextResponse.json({ error: error.message, message: error.message, code: error.code, success: false }, { status: error.status || 409 });
    }
    if (/appointment/i.test(error.message || '') && error.status && error.status < 500) {
      return NextResponse.json({ error: error.message, message: error.message, success: false }, { status: error.status });
    }
    const isKnownBusinessError = knownMessages.includes(error.message) || /Assign staff|unavailable|Not enough stock|cannot|Invalid|exceed|less than/i.test(error.message || '');
    const message = isKnownBusinessError
      ? error.message
      : 'Unable to complete the bill. No transaction was saved. Please try again.';
    console.error('POST /api/admin/billing:', error);
    return NextResponse.json({ error: message, message, success: false }, { status: isKnownBusinessError ? (error.status || 400) : 500 });
  }
}
