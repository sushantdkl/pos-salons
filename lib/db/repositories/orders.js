import Database from '../index.js';

export class OrderRepository {
  constructor() {
    this.db = Database.getInstance();
  }
  
  create(orderData) {
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    const insertOrder = this.db.db.prepare(`
      INSERT INTO orders (order_number, table_id, waiter_id, order_type, status, notes, customer_name, customer_phone)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `);
    
    const insertItem = this.db.db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, variant_id, quantity, unit_price, subtotal, special_instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    return this.db.transaction(() => {
      const result = insertOrder.run(
        orderNumber,
        orderData.table_id || null,
        orderData.waiter_id,
        orderData.order_type || 'dine-in',
        orderData.notes || null,
        orderData.customer_name || null,
        orderData.customer_phone || null
      );
      
      const orderId = result.lastInsertRowid;
      
      // Insert order items
      for (const item of orderData.items) {
        const subtotal = item.price * item.quantity;
        insertItem.run(
          orderId,
          item.menu_item_id,
          item.variant_id || null,
          item.quantity,
          item.price,
          subtotal,
          item.special_instructions || null
        );
      }
      
      // If dine-in order, mark table as occupied
      if (orderData.table_id) {
        this.db.run(`
          UPDATE tables 
          SET status = 'occupied',
              current_order_id = ?,
              waiter_id = ?,
              occupied_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [orderId, orderData.waiter_id, orderData.table_id]);
      }
      
      return { order_id: orderId, order_number: orderNumber };
    })();
  }
  
  getById(id) {
    const order = this.db.get(`
      SELECT o.*, 
             o.id as order_id,
             t.table_number, 
             u.full_name as waiter_name,
             (SELECT SUM(subtotal) FROM order_items WHERE order_id = o.id) as total_amount,
             (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      WHERE o.id = ?
    `, [id]);
    
    return order;
  }
  
  getAll(filters = {}) {
    let sql = `
      SELECT o.*, 
             o.id as order_id,
             t.table_number, 
             u.full_name as waiter_name,
             COUNT(oi.id) as item_count,
             SUM(oi.subtotal) as total_amount
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (filters.status) {
      conditions.push('o.status = ?');
      params.push(filters.status);
    }
    
    if (filters.waiter_id) {
      conditions.push('o.waiter_id = ?');
      params.push(filters.waiter_id);
    }
    
    if (filters.order_type) {
      conditions.push('o.order_type = ?');
      params.push(filters.order_type);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' GROUP BY o.id ORDER BY o.created_at DESC';
    
    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    return this.db.all(sql, params);
  }
  
  updateStatus(id, status) {
    return this.db.transaction(() => {
      const updates = ['status = ?'];
      const params = [status];
      
      if (status === 'served') {
        updates.push('served_at = CURRENT_TIMESTAMP');
      } else if (status === 'cancelled') {
        updates.push('cancelled_at = CURRENT_TIMESTAMP');
      } else if (status === 'ready') {
        updates.push('ready_at = CURRENT_TIMESTAMP');
      }
      
      params.push(id);
      
      this.db.run(`
        UPDATE orders 
        SET ${updates.join(', ')}
        WHERE id = ?
      `, params);
      
      // If served, completed or cancelled, free up the table
      if (status === 'served' || status === 'completed' || status === 'cancelled') {
        const order = this.getById(id);
        if (order && order.table_id) {
          this.db.run(`
            UPDATE tables 
            SET status = 'available',
                current_order_id = NULL,
                waiter_id = NULL,
                occupied_at = NULL
            WHERE id = ?
          `, [order.table_id]);
        }
      }
      
      return true;
    })();
  }
  
  cancelOrder(id, reason) {
    return this.db.run(`
      UPDATE orders 
      SET status = 'cancelled',
          cancelled_at = CURRENT_TIMESTAMP,
          cancel_reason = ?
      WHERE id = ?
    `, [reason, id]);
  }
  
  getActiveOrders() {
    return this.db.all(`
      SELECT o.*, t.table_number, u.full_name as waiter_name,
             COUNT(oi.id) as item_count,
             SUM(oi.subtotal) as total_amount
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.waiter_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.status NOT IN ('served', 'cancelled')
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
  }
  
  getPendingOrders() {
    return this.getAll({ status: 'pending' });
  }

  getOrderItems(orderId) {
    return this.db.all(`
      SELECT oi.*, 
             oi.unit_price as price,
             mi.name as item_name, 
             mc.name as category, 
             mi.is_vegetarian as is_veg
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN menu_categories mc ON mi.category_id = mc.id
      WHERE oi.order_id = ?
      ORDER BY oi.created_at
    `, [orderId]);
  }

  addItems(orderId, items) {
    const insertItem = this.db.db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, variant_id, quantity, unit_price, subtotal, special_instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    return this.db.transaction(() => {
      for (const item of items) {
        const subtotal = item.price * item.quantity;
        insertItem.run(
          orderId,
          item.menu_item_id,
          item.variant_id || null,
          item.quantity,
          item.price,
          subtotal,
          item.special_instructions || null
        );
      }
      return true;
    })();
  }

  createBillAndPayment(billData) {
    return this.db.transaction(() => {
      // Generate bill number
      const billNumber = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Create bill
      const insertBill = this.db.db.prepare(`
        INSERT INTO bills (
          bill_number, order_id, table_id, subtotal, service_charge, service_charge_percent,
          tax, tax_percent, discount_amount, discount_reason, grand_total, status, cashier_id, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, CURRENT_TIMESTAMP)
      `);
      
      const billResult = insertBill.run(
        billNumber,
        billData.order_id,
        billData.table_id || null,
        billData.subtotal,
        billData.service_charge,
        billData.service_charge_percent,
        billData.tax_amount,
        billData.tax_percent,
        billData.discount_amount || 0,
        billData.discount_reason || null,
        billData.final_amount,
        billData.cashier_id
      );
      
      const billId = billResult.lastInsertRowid;
      
      // Create payment(s)
      const insertPayment = this.db.db.prepare(`
        INSERT INTO bill_payments (
          bill_id, payment_method, amount, reference_number, notes
        ) VALUES (?, ?, ?, ?, ?)
      `);
      
      const notes = JSON.stringify({
        customer_name: billData.customer_name || '',
        customer_phone: billData.customer_phone || '',
        processed_by: billData.cashier_id
      });
      
      if (billData.split_payments) {
        const splitPayments = JSON.parse(billData.split_payments);
        for (const payment of splitPayments) {
          insertPayment.run(
            billId,
            payment.method,
            payment.amount,
            billData.reference_number,
            notes
          );
        }
      } else {
        insertPayment.run(
          billId,
          billData.payment_method,
          billData.final_amount,
          billData.reference_number,
          notes
        );
      }
      
      return {
        bill: { id: billId, bill_number: billNumber },
        payment: { id: billId }
      };
    })();
  }

  processPayment(paymentData) {
    const insertPayment = this.db.db.prepare(`
      INSERT INTO bill_payments (
        bill_id, payment_method, amount, reference_number, notes
      ) VALUES (?, ?, ?, ?, ?)
    `);

    return this.db.transaction(() => {
      // Create payment record(s)
      if (paymentData.split_payments) {
        // Handle split payments
        const splitPayments = JSON.parse(paymentData.split_payments);
        const paymentIds = [];
        
        for (const payment of splitPayments) {
          const notes = JSON.stringify({
            type: 'split',
            discount_amount: paymentData.discount_amount || 0,
            discount_reason: paymentData.discount_reason || '',
            subtotal: paymentData.subtotal,
            tax_amount: paymentData.tax_amount,
            service_charge: paymentData.service_charge,
            final_amount: paymentData.final_amount,
            processed_by: paymentData.processed_by,
            customer_name: paymentData.customer_name || '',
            customer_phone: paymentData.customer_phone || ''
          });

          const result = insertPayment.run(
            paymentData.bill_id,
            payment.method,
            payment.amount,
            payment.reference || null,
            notes
          );
          paymentIds.push(result.lastInsertRowid);
        }
        
        return { id: paymentIds[0], split_payment_ids: paymentIds };
      } else {
        // Single payment
        const notes = JSON.stringify({
          type: 'single',
          discount_amount: paymentData.discount_amount || 0,
          discount_reason: paymentData.discount_reason || '',
          subtotal: paymentData.subtotal,
          tax_amount: paymentData.tax_amount,
          service_charge: paymentData.service_charge,
          final_amount: paymentData.final_amount,
          processed_by: paymentData.processed_by,
          customer_name: paymentData.customer_name || '',
          customer_phone: paymentData.customer_phone || ''
        });

        const result = insertPayment.run(
          paymentData.bill_id,
          paymentData.payment_method,
          paymentData.amount_paid,
          paymentData.reference_number || null,
          notes
        );

        return { id: result.lastInsertRowid };
      }
    })();
  }

  getPayments(orderId) {
    return this.db.all(`
      SELECT * FROM bill_payments
      WHERE bill_id = ?
      ORDER BY created_at DESC
    `, [orderId]);
  }

  getAllPayments(startDate = null, endDate = null) {
    let query = `
      SELECT bp.*, o.order_number, o.table_id, t.table_number
      FROM bill_payments bp
      JOIN orders o ON bp.bill_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ` AND date(bp.created_at) >= date(?)`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND date(bp.created_at) <= date(?)`;
      params.push(endDate);
    }

    query += ` ORDER BY bp.created_at DESC`;

    return this.db.all(query, params);
  }
}
