import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { logAction } from '@/lib/db/helpers';
import { cleanText, ensureSalonSchema, requireRole } from '@/lib/salon-schema';

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

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);
    const bills = await db.all(`
      SELECT b.*, COUNT(i.id)::int as item_count
      FROM salon_bills b
      LEFT JOIN salon_bill_items i ON i.bill_id = b.id
      GROUP BY b.id
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
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const services = Array.isArray(data.services) ? data.services : [];
    const products = Array.isArray(data.products) ? data.products : [];
    const shouldPrint = Boolean(data.should_print);
    if (services.length === 0 && products.length === 0) {
      return NextResponse.json({ error: 'Add at least one service or product' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      let customerId = data.customer_id || null;
      const tokenId = Number(data.token_id || 0) || null;
      let linkedToken = null;
      if (tokenId) {
        linkedToken = await tx.get('SELECT * FROM walk_in_tokens WHERE id = ?', [tokenId]);
        if (!linkedToken) throw new Error('Selected token was not found');
        if (linkedToken.invoice_id || linkedToken.status === 'BILLED') throw new Error('This token has already been billed');
        if (linkedToken.status !== 'WAITING') throw new Error('Only waiting tokens can be billed');
      }
      const customerName = cleanText(data.customer?.name || data.customer_name || 'Walk-in Customer');
      const customerPhone = cleanText(data.customer?.phone || data.customer_phone, null);

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
          SELECT salon_role, commission_percentage, assigned_services
          FROM staff_profiles
          WHERE user_id = ? AND salon_role IN ('barber', 'stylist', 'beautician')
        `, [staffId]);
        if (!staffProfile) throw new Error(`Selected staff cannot perform ${service.name}`);
        const assignedServices = String(staffProfile.assigned_services || '')
          .split(',')
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);
        const packageServices = String(service.package_items || '')
          .split(',')
          .map((name) => name.trim().toLowerCase())
          .filter(Boolean);
        const serviceKeys = [service.name.toLowerCase(), ...packageServices];
        if (assignedServices.length && !serviceKeys.some((name) => assignedServices.includes(name) || (name.includes('facial') && assignedServices.includes('facial')))) {
          throw new Error(`${staffProfile.salon_role} is not assigned to ${service.name}`);
        }
        const commissionPercentage = Number(staffProfile?.commission_percentage || 0);
        serviceRows.push({
          item_type: 'service',
          item_id: service.id,
          name: service.name,
          quantity: 1,
          unit_price: Number(service.price),
          subtotal: Number(service.price),
          staff_id: staffId,
          staff_role: staffProfile.salon_role,
          commission_percentage: commissionPercentage,
          commission_amount: Number(service.price) * commissionPercentage / 100,
        });
      }

      const productRows = [];
      for (const item of products) {
        const product = await tx.get('SELECT * FROM salon_products WHERE id = ? AND status = ?', [item.id, 'active']);
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
          previous_stock: product.current_stock,
          new_stock: product.current_stock - quantity,
        });
      }

      const items = [...serviceRows, ...productRows];
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      const discountType = data.discount_type === 'percentage' ? 'percentage' : 'amount';
      const discountAmount = normalizeDiscount(discountType, data.discount_value || data.discount_amount, subtotal);
      const taxable = subtotal - discountAmount;
      const taxPercent = Number(data.tax_percent || 0);
      if (taxPercent < 0 || taxPercent > 100) throw new Error('Invalid tax percentage');
      const tax = taxable * taxPercent / 100;
      const serviceCharge = Number(data.service_charge || 0);
      if (serviceCharge < 0) throw new Error('Service charge cannot be negative');
      const grandTotal = taxable + tax + serviceCharge;
      const paymentMethod = ['cash', 'card', 'online', 'split'].includes(data.payment_method) ? data.payment_method : 'cash';
      const amountPaid = Number(data.amount_paid || grandTotal);
      if (amountPaid < grandTotal && paymentMethod !== 'split') throw new Error('Amount paid is less than total');

      const billNumber = `SALON-${Date.now()}`;
      const billResult = await tx.run(`
        INSERT INTO salon_bills (
          bill_number, customer_id, customer_name, customer_phone, subtotal,
          discount_amount, discount_type, tax, tax_percent, service_charge,
          grand_total, payment_method, amount_paid, cashier_id, token_id,
          transaction_time, is_printed, printed_at, printed_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
      `, [
        billNumber,
        customerId,
        customerName,
        customerPhone,
        subtotal,
        discountAmount,
        discountType,
        tax,
        taxPercent,
        serviceCharge,
        grandTotal,
        paymentMethod,
        amountPaid,
        user.id,
        tokenId,
        shouldPrint,
        shouldPrint ? new Date().toISOString() : null,
        shouldPrint ? user.id : null,
        cleanText(data.notes, null),
      ]);

      const billId = billResult.lastInsertRowid;
      for (const item of items) {
        await tx.run(`
          INSERT INTO salon_bill_items (
            bill_id, item_type, item_id, name, quantity, unit_price,
            subtotal, staff_id, commission_percentage, commission_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          billId, item.item_type, item.item_id, item.name, item.quantity, item.unit_price,
          item.subtotal, item.staff_id, item.commission_percentage, item.commission_amount,
        ]);
        if (item.item_type === 'product') {
          await tx.run('UPDATE salon_products SET current_stock = ?, updated_at = NOW() WHERE id = ?', [item.new_stock, item.item_id]);
          await tx.run(`
            INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, notes)
            VALUES (?, 'sale', ?, ?, ?, ?)
          `, [item.item_id, item.quantity, item.previous_stock, item.new_stock, billNumber]);
        }
      }

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
        await tx.run(`
          UPDATE walk_in_tokens
          SET status = 'BILLED', billed_at = NOW(), invoice_id = ?, updated_at = NOW()
          WHERE id = ?
        `, [billId, tokenId]);
      }

      return {
        bill: {
          id: billId,
          bill_number: billNumber,
          customer_id: customerId,
          customer_name: customerName,
          customer_phone: customerPhone,
          subtotal,
          discount_amount: discountAmount,
          discount_type: discountType,
          tax,
          tax_percent: taxPercent,
          service_charge: serviceCharge,
          grand_total: grandTotal,
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          token_id: tokenId,
          token_number: linkedToken?.token_number || null,
          is_printed: shouldPrint,
          printed_at: shouldPrint ? new Date().toISOString() : null,
          printed_by: shouldPrint ? user.id : null,
          created_at: new Date().toISOString(),
        },
        items,
      };
    });

    return NextResponse.json({ message: 'Bill completed successfully', ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to complete bill' }, { status: 400 });
  }
}
