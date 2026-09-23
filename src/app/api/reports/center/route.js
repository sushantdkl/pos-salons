import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { isCanonicalAdDate, nepalDateString } from '@/lib/dates/calendar';

const REPORTS = new Set(['overview','sales','services','products','payments','credit','expenses','advances']);
const money = (value) => Number(Number(value || 0).toFixed(2));

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.REPORTS_VIEW);
    const params = new URL(request.url).searchParams;
    const report = REPORTS.has(params.get('report')) ? params.get('report') : 'overview';
    if (report === 'advances' && user.role !== 'admin') return NextResponse.json({ error: 'Payroll reports are Admin only' }, { status: 403 });
    const start = params.get('start') || nepalDateString();
    const end = params.get('end') || start;
    if (!isCanonicalAdDate(start) || !isCanonicalAdDate(end) || start > end) return NextResponse.json({ error: 'Invalid report date range' }, { status: 400 });
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize') || 25)));
    const offset = (page - 1) * pageSize;
    let rows = []; let metrics = {}; let total = 0;
    const billRange = `COALESCE(b.transaction_time,b.created_at) >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND COALESCE(b.transaction_time,b.created_at) < ((?::date + 1) AT TIME ZONE 'Asia/Kathmandu') AND b.status='paid'`;
    if (['overview','sales'].includes(report)) {
      const summary = await db.get(`SELECT COALESCE(SUM(subtotal),0) gross_billed, COALESCE(SUM(discount_amount),0) discounts, COALESCE(SUM(tax),0) tax, COALESCE(SUM(grand_total),0) revenue_after_voids, COUNT(*)::int invoices FROM salon_bills b WHERE ${billRange}`, [start,end]);
      metrics = Object.fromEntries(Object.entries(summary).map(([key,value]) => [key, key === 'invoices' ? Number(value) : money(value)]));
      const settlements = await db.all(`SELECT a.method,COALESCE(SUM(a.amount),0) amount FROM salon_payment_allocations a JOIN salon_bills b ON b.id=a.bill_id WHERE ${billRange} GROUP BY a.method`, [start,end]);
      const byMethod = Object.fromEntries(settlements.map((row)=>[row.method,money(row.amount)]));
      metrics = { ...metrics, cash_received: byMethod.cash || 0, online_received: byMethod.online || 0, credit_issued: byMethod.credit || 0 };
      if (report === 'sales') {
        const count = await db.get(`SELECT COUNT(*)::int total FROM salon_bills b WHERE ${billRange}`, [start,end]); total = Number(count.total);
        rows = await db.all(`SELECT b.id,b.bill_number,b.customer_name,b.grand_total,b.total_paid,b.credit_amount,b.payment_method,b.transaction_time FROM salon_bills b WHERE ${billRange} ORDER BY COALESCE(b.transaction_time,b.created_at) DESC,b.id DESC LIMIT ? OFFSET ?`, [start,end,pageSize,offset]);
      }
    } else if (report === 'services' || report === 'products') {
      const type = report === 'services' ? 'service' : 'product';
      const count = await db.get(`SELECT COUNT(DISTINCT i.item_id)::int total FROM salon_bill_items i JOIN salon_bills b ON b.id=i.bill_id WHERE i.item_type=? AND ${billRange}`, [type,start,end]); total=Number(count.total);
      rows = await db.all(`SELECT i.item_id id,i.name,SUM(i.quantity)::int quantity,COALESCE(SUM(i.subtotal),0) revenue,COALESCE(SUM(i.commission_amount),0) commission,COALESCE(SUM(i.unit_cost_snapshot*i.quantity),0) cost FROM salon_bill_items i JOIN salon_bills b ON b.id=i.bill_id WHERE i.item_type=? AND ${billRange} GROUP BY i.item_id,i.name ORDER BY revenue DESC LIMIT ? OFFSET ?`, [type,start,end,pageSize,offset]);
      const summary = await db.get(`SELECT COALESCE(SUM(i.quantity),0)::int quantity,COALESCE(SUM(i.subtotal),0) revenue,COALESCE(SUM(i.commission_amount),0) commission,COALESCE(SUM(i.unit_cost_snapshot*i.quantity),0) cost FROM salon_bill_items i JOIN salon_bills b ON b.id=i.bill_id WHERE i.item_type=? AND ${billRange}`, [type,start,end]);
      metrics = { revenue: money(summary.revenue), quantity: Number(summary.quantity), commission: money(summary.commission), cost: money(summary.cost) };
    } else if (report === 'payments') {
      rows = await db.all(`SELECT a.method,COALESCE(a.provider,'') provider,COUNT(*)::int transactions,COALESCE(SUM(a.amount),0) amount,COALESCE(SUM(a.change_amount),0) change FROM salon_payment_allocations a JOIN salon_bills b ON b.id=a.bill_id WHERE ${billRange} GROUP BY a.method,a.provider ORDER BY a.method,a.provider`, [start,end]); total=rows.length; metrics={ settled: money(rows.reduce((sum,row)=>sum+Number(row.amount),0)) };
    } else if (report === 'credit') {
      const count=await db.get(`SELECT COUNT(*)::int total FROM customer_credit_ledger WHERE created_at >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND created_at < ((?::date+1) AT TIME ZONE 'Asia/Kathmandu')`,[start,end]); total=Number(count.total);
      rows=await db.all(`SELECT l.id,l.customer_id,c.name customer,l.entry_type,l.debit,l.credit,l.created_at,l.bill_id FROM customer_credit_ledger l JOIN customers c ON c.id=l.customer_id WHERE l.created_at >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND l.created_at < ((?::date+1) AT TIME ZONE 'Asia/Kathmandu') ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,[start,end,pageSize,offset]);
      const balance=await db.get(`SELECT COALESCE(SUM(debit-credit),0) balance FROM customer_credit_ledger`); metrics={ outstanding:money(balance.balance) };
    } else if (report === 'expenses') {
      const count=await db.get(`SELECT COUNT(*)::int total FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN ?::date AND ?::date`,[start,end]); total=Number(count.total);
      rows=await db.all(`SELECT id,title,category,amount,payment_method,expense_date,paid_to FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN ?::date AND ?::date ORDER BY expense_date DESC,id DESC LIMIT ? OFFSET ?`,[start,end,pageSize,offset]);
      const sum=await db.get(`SELECT COALESCE(SUM(amount),0) amount FROM expenses WHERE deleted_at IS NULL AND expense_date BETWEEN ?::date AND ?::date`,[start,end]); metrics={ expenses:money(sum.amount) };
    } else if (report === 'advances') {
      const count=await db.get(`SELECT COUNT(*)::int total FROM salary_advances WHERE deleted_at IS NULL AND status<>'CANCELLED' AND payment_date BETWEEN ?::date AND ?::date`,[start,end]); total=Number(count.total);
      rows=await db.all(`SELECT a.id,u.full_name employee,a.amount,a.applied_amount,(a.amount-a.applied_amount) outstanding,a.payment_method,a.payment_date,a.status FROM salary_advances a JOIN users u ON u.id=a.staff_id WHERE a.deleted_at IS NULL AND a.status<>'CANCELLED' AND a.payment_date BETWEEN ?::date AND ?::date ORDER BY a.payment_date DESC,a.id DESC LIMIT ? OFFSET ?`,[start,end,pageSize,offset]);
      const sum=await db.get(`SELECT COALESCE(SUM(amount),0) issued,COALESCE(SUM(amount-applied_amount),0) outstanding FROM salary_advances WHERE deleted_at IS NULL AND status<>'CANCELLED' AND payment_date BETWEEN ?::date AND ?::date`,[start,end]); metrics={ issued:money(sum.issued),outstanding:money(sum.outstanding) };
    }
    return NextResponse.json({ report, definition: { start, end, dateBasis: report === 'expenses' ? 'expense date' : report === 'advances' ? 'advance date' : 'transaction time / Nepal business date', statuses: report.includes('sale') || ['overview','services','products','payments'].includes(report) ? ['paid'] : ['active'], currency: 'NPR', taxTreatment: 'Gross billed and tax are separate metrics; revenue includes tax as recorded', rounding: 'two decimal places' }, metrics, rows, pagination: { page,pageSize,total,pages:Math.ceil(total/pageSize) } });
  } catch (error) { return NextResponse.json({ error:error.message || 'Unable to generate report' },{ status:error.status || 500 }); }
}
