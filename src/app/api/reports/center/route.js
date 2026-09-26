import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { hasPermission, PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { redactReport, SENSITIVE_REPORT_FIELDS } from '@/lib/reports/redact';
import { isCanonicalAdDate, nepalDateString } from '@/lib/dates/calendar';
import { PAID_BILL_STATUS_SQL, SALARY_EXPENSE_CATEGORIES } from '@/lib/reports/finance-summary';

// Operating expenses only — the definition every other screen uses. Salary / commission and
// non-P&L drawer transfers (CASH_TRANSFER) are reported elsewhere.
const OPERATING_EXPENSE_SQL = `deleted_at IS NULL AND COALESCE(record_type,'EXPENSE')='EXPENSE' AND category NOT IN (${SALARY_EXPENSE_CATEGORIES.map((c) => `'${c}'`).join(',')})`;

const REPORTS = new Set(['overview','sales','services','products','payments','credit','expenses','advances']);
const money = (value) => Number(Number(value || 0).toFixed(2));

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const user = await requirePermission(request, db, PERMISSIONS.REPORTS_VIEW);
    const params = new URL(request.url).searchParams;
    const report = REPORTS.has(params.get('report')) ? params.get('report') : 'overview';
    if (report === 'advances' && user.role !== 'admin' && !(await hasPermission(db, user, PERMISSIONS.REPORTS_ADVANCES))) {
      return NextResponse.json({ error: 'The Advances Report needs the “Advances report” permission' }, { status: 403 });
    }
    const showSensitive = user.role === 'admin' || await hasPermission(db, user, PERMISSIONS.REPORTS_SENSITIVE);
    const start = params.get('start') || nepalDateString();
    const end = params.get('end') || start;
    if (!isCanonicalAdDate(start) || !isCanonicalAdDate(end) || start > end) return NextResponse.json({ error: 'Invalid report date range' }, { status: 400 });
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageSize = Math.min(100, Math.max(10, Number(params.get('pageSize') || 25)));
    const offset = (page - 1) * pageSize;
    let rows = []; let metrics = {}; let total = 0;
    // Same "sold bill" rule as finance-summary: a voided bill stays a sale on its sale date and
    // the void is deducted on the date it was processed.
    const billRange = `COALESCE(b.transaction_time,b.created_at) >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND COALESCE(b.transaction_time,b.created_at) < ((?::date + 1) AT TIME ZONE 'Asia/Kathmandu') AND ${PAID_BILL_STATUS_SQL}`;
    if (['overview','sales'].includes(report)) {
      const summary = await db.get(`SELECT COALESCE(SUM(subtotal),0) gross_billed, COALESCE(SUM(discount_amount),0) discounts, COALESCE(SUM(tax),0) tax, COALESCE(SUM(grand_total),0) finalized_total, COUNT(*)::int invoices FROM salon_bills b WHERE ${billRange}`, [start,end]);
      const voids = await db.get(`SELECT COALESCE(SUM(fc.amount),0) voids, COUNT(*)::int void_count FROM financial_corrections fc WHERE fc.source_type='salon_bill' AND fc.correction_type='void' AND fc.created_at >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND fc.created_at < ((?::date + 1) AT TIME ZONE 'Asia/Kathmandu')`, [start,end]);
      metrics = {
        gross_billed: money(summary.gross_billed), discounts: money(summary.discounts), tax: money(summary.tax),
        finalized_total: money(summary.finalized_total), voids: money(voids.voids), void_count: Number(voids.void_count),
        revenue_after_voids: money(Number(summary.finalized_total) - Number(voids.voids)), invoices: Number(summary.invoices),
      };
      const settlements = await db.all(`SELECT a.method,COALESCE(SUM(a.amount),0) amount FROM salon_payment_allocations a JOIN salon_bills b ON b.id=a.bill_id WHERE ${billRange} GROUP BY a.method`, [start,end]);
      const byMethod = Object.fromEntries(settlements.map((row)=>[row.method,money(row.amount)]));
      metrics = { ...metrics, cash_received: byMethod.cash || 0, online_received: byMethod.online || 0, credit_issued: byMethod.credit || 0 };
      if (report === 'sales') {
        const count = await db.get(`SELECT COUNT(*)::int total FROM salon_bills b WHERE ${billRange}`, [start,end]); total = Number(count.total);
        rows = await db.all(`SELECT b.id,b.bill_number,b.customer_name,b.grand_total,b.total_paid,b.credit_amount,b.payment_method,b.status,b.transaction_time FROM salon_bills b WHERE ${billRange} ORDER BY COALESCE(b.transaction_time,b.created_at) DESC,b.id DESC LIMIT ? OFFSET ?`, [start,end,pageSize,offset]);
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
      rows=await db.all(`SELECT l.id,l.customer_id,c.name customer,l.entry_type,l.debit,l.credit,l.created_at,l.bill_id,sb.bill_number FROM customer_credit_ledger l JOIN customers c ON c.id=l.customer_id LEFT JOIN salon_bills sb ON sb.id=l.bill_id WHERE l.created_at >= (?::date AT TIME ZONE 'Asia/Kathmandu') AND l.created_at < ((?::date+1) AT TIME ZONE 'Asia/Kathmandu') ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,[start,end,pageSize,offset]);
      const balance=await db.get(`SELECT COALESCE(SUM(debit-credit),0) balance FROM customer_credit_ledger`); metrics={ outstanding:money(balance.balance) };
    } else if (report === 'expenses') {
      const count=await db.get(`SELECT COUNT(*)::int total FROM expenses WHERE ${OPERATING_EXPENSE_SQL} AND expense_date BETWEEN ?::date AND ?::date`,[start,end]); total=Number(count.total);
      rows=await db.all(`SELECT id,title,category,amount,payment_method,expense_date,paid_to FROM expenses WHERE ${OPERATING_EXPENSE_SQL} AND expense_date BETWEEN ?::date AND ?::date ORDER BY expense_date DESC,id DESC LIMIT ? OFFSET ?`,[start,end,pageSize,offset]);
      const sum=await db.get(`SELECT COALESCE(SUM(amount),0) amount FROM expenses WHERE ${OPERATING_EXPENSE_SQL} AND expense_date BETWEEN ?::date AND ?::date`,[start,end]); metrics={ expenses:money(sum.amount) };
    } else if (report === 'advances') {
      const count=await db.get(`SELECT COUNT(*)::int total FROM salary_advances WHERE deleted_at IS NULL AND status<>'CANCELLED' AND payment_date BETWEEN ?::date AND ?::date`,[start,end]); total=Number(count.total);
      rows=await db.all(`SELECT a.id,u.full_name employee,a.amount,a.applied_amount,(a.amount-a.applied_amount) outstanding,a.payment_method,a.payment_date,a.status FROM salary_advances a JOIN users u ON u.id=a.staff_id WHERE a.deleted_at IS NULL AND a.status<>'CANCELLED' AND a.payment_date BETWEEN ?::date AND ?::date ORDER BY a.payment_date DESC,a.id DESC LIMIT ? OFFSET ?`,[start,end,pageSize,offset]);
      const sum=await db.get(`SELECT COALESCE(SUM(amount),0) issued,COALESCE(SUM(amount-applied_amount),0) outstanding FROM salary_advances WHERE deleted_at IS NULL AND status<>'CANCELLED' AND payment_date BETWEEN ?::date AND ?::date`,[start,end]); metrics={ issued:money(sum.issued),outstanding:money(sum.outstanding) };
    }
    const payload = { report, definition: { start, end, dateBasis: report === 'expenses' ? 'expense date' : report === 'advances' ? 'advance date' : 'transaction time / Nepal business date', statuses: report.includes('sale') || ['overview','services','products','payments'].includes(report) ? ['paid'] : ['active'], currency: 'NPR', taxTreatment: 'Gross billed and tax are separate metrics; revenue includes tax as recorded', rounding: 'two decimal places' }, metrics, rows, pagination: { page,pageSize,total,pages:Math.ceil(total/pageSize) } };
    return NextResponse.json(showSensitive ? payload : { ...redactReport(payload), hiddenFields: SENSITIVE_REPORT_FIELDS });
  } catch (error) { return NextResponse.json({ error:error.message || 'Unable to generate report' },{ status:error.status || 500 }); }
}
