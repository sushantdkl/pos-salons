import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
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
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    requireRole(request, db, ['admin', 'cashier']);
    const bills = db.prepare(`
      SELECT b.*, COUNT(i.id) as item_count
      FROM salon_bills b
      LEFT JOIN salon_bill_items i ON i.bill_id = b.id
      GROUP BY b.id
      ORDER BY b.created_at DESC
      LIMIT 100
    `).all();
    return NextResponse.json({ bills });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch bills' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance().db;
    ensureSalonSchema(db);
    const user = requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const services = Array.isArray(data.services) ? data.services : [];
    const products = Array.isArray(data.products) ? data.products : [];
    if (services.length === 0 && products.length === 0) {
      return NextResponse.json({ error: 'Add at least one service or product' }, { status: 400 });
    }

    const createBill = db.transaction(() => {
      let customerId = data.customer_id || null;
      const customerName = cleanText(data.customer?.name || data.customer_name || 'Walk-in Customer');
      const customerPhone = cleanText(data.customer?.phone || data.customer_phone, null);

      if (!customerId && customerPhone) {
        const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(customerPhone);
        if (existing) {
          customerId = existing.id;
          db.prepare('UPDATE customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(customerName, customerId);
        } else {
          const customerResult = db.prepare('INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)').run(customerName, customerPhone, cleanText(data.customer?.notes, null));
          customerId = customerResult.lastInsertRowid;
        }
      }

      const serviceRows = services.map((item) => {
        const service = db.prepare('SELECT * FROM salon_services WHERE id = ? AND is_active = 1').get(item.id);
        if (!service) throw new Error(`Service unavailable: ${item.name || item.id}`);
        const staffId = Number(item.staff_id || 0) || null;
        if (!staffId) throw new Error(`Assign staff for ${service.name}`);
        const staffProfile = db.prepare(`
          SELECT salon_role, commission_percentage
          FROM staff_profiles
          WHERE user_id = ? AND salon_role IN ('barber', 'stylist', 'beautician')
        `).get(staffId);
        if (!staffProfile) throw new Error(`Selected staff cannot perform ${service.name}`);
        const commissionPercentage = Number(staffProfile?.commission_percentage || 0);
        return {
          item_type: 'service',
          item_id: service.id,
          name: service.name,
          quantity: 1,
          unit_price: Number(service.price),
          subtotal: Number(service.price),
          staff_id: staffId,
          staff_role: staffProfile.salon_role,
          commission_percentage: commissionPercentage,
          commission_amount: Number(service.price) * commissionPercentage / 100
        };
      });

      const productRows = products.map((item) => {
        const product = db.prepare('SELECT * FROM salon_products WHERE id = ? AND status = ?').get(item.id, 'active');
        if (!product) throw new Error(`Product unavailable: ${item.name || item.id}`);
        const quantity = Number(item.quantity || 1);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Invalid quantity for ${product.name}`);
        if (product.current_stock < quantity) throw new Error(`Not enough stock for ${product.name}`);
        return {
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
          new_stock: product.current_stock - quantity
        };
      });

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
      const billResult = db.prepare(`
        INSERT INTO salon_bills (
          bill_number, customer_id, customer_name, customer_phone, subtotal,
          discount_amount, discount_type, tax, tax_percent, service_charge,
          grand_total, payment_method, amount_paid, cashier_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
        cleanText(data.notes, null)
      );

      const billId = billResult.lastInsertRowid;
      const insertItem = db.prepare(`
        INSERT INTO salon_bill_items (
          bill_id, item_type, item_id, name, quantity, unit_price,
          subtotal, staff_id, commission_percentage, commission_amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      items.forEach((item) => {
        insertItem.run(billId, item.item_type, item.item_id, item.name, item.quantity, item.unit_price, item.subtotal, item.staff_id, item.commission_percentage, item.commission_amount);
        if (item.item_type === 'product') {
          db.prepare('UPDATE salon_products SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.new_stock, item.item_id);
          db.prepare(`
            INSERT INTO inventory_movements (product_id, movement_type, quantity, previous_stock, new_stock, notes)
            VALUES (?, 'sale', ?, ?, ?, ?)
          `).run(item.item_id, item.quantity, item.previous_stock, item.new_stock, billNumber);
        }
      });

      if (customerId) {
        const serviceNames = serviceRows.map((item) => item.name).join(', ');
        const preferred = serviceRows.reduce((acc, item) => {
          if (item.staff_role === 'barber' && !acc.barber) acc.barber = item.staff_id;
          if (item.staff_role === 'stylist' && !acc.stylist) acc.stylist = item.staff_id;
          if (item.staff_role === 'beautician' && !acc.beautician) acc.beautician = item.staff_id;
          return acc;
        }, {});
        db.prepare(`
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
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          grandTotal,
          serviceNames,
          serviceNames,
          serviceNames,
          preferred.barber || null,
          preferred.stylist || null,
          preferred.beautician || null,
          grandTotal,
          customerId
        );
      }

      db.prepare('INSERT INTO action_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, 'create', 'bill', billId, billNumber);

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
          created_at: new Date().toISOString()
        },
        items
      };
    });

    const result = createBill();
    return NextResponse.json({ message: 'Bill completed successfully', ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to complete bill' }, { status: 400 });
  }
}
