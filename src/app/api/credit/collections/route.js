import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { PERMISSIONS, requirePermission } from '@/lib/auth/permissions';
import { requireOpenSession } from '@/lib/business-day/service';
import { canonicalPaymentMethod } from '@/lib/payments/allocations';
import { fromMinor, toMinor } from '@/lib/payments/money';

export async function POST(request) {
  try {
    const db=Database.getInstance(); const user=await requirePermission(request,db,PERMISSIONS.BILLING_CREDIT_CREATE); const data=await request.json();
    const idempotency=String(request.headers.get('idempotency-key')||data.idempotency_key||'').trim()||randomUUID();
    const prior=await db.get('SELECT id,amount FROM customer_credit_collections WHERE idempotency_key=?',[idempotency]);
    if(prior)return NextResponse.json({collectionId:prior.id,amount:Number(prior.amount),duplicate:true});
    const customerId=Number(data.customer_id||0); const amountMinor=toMinor(data.amount); if(amountMinor<=0)throw new Error('Collection amount must be greater than zero');
    const method=canonicalPaymentMethod(data.payment_method); if(method==='credit')throw new Error('A credit collection must be paid by cash or online');
    const tenderedMinor=method==='cash'?toMinor(data.cash_tendered??data.amount):null; if(method==='cash'&&tenderedMinor<amountMinor)throw new Error('Cash tendered is less than the collection');
    const scope=await requireOpenSession(db);
    const result=await db.transaction(async(tx)=>{const customer=await tx.get('SELECT id,name FROM customers WHERE id=? FOR UPDATE',[customerId]);if(!customer)throw new Error('Customer not found');const balanceRow=await tx.get('SELECT COALESCE(SUM(debit-credit),0) balance FROM customer_credit_ledger WHERE customer_id=?',[customerId]);const balanceMinor=toMinor(balanceRow.balance);if(amountMinor>balanceMinor)throw new Error('Collection cannot exceed outstanding customer credit');const ledger=await tx.run(`INSERT INTO customer_credit_ledger(customer_id,entry_type,debit,credit,note,business_day_id,created_by,idempotency_key) VALUES (?,'credit_collection',0,?,?,?,?,?)`,[customerId,fromMinor(amountMinor),String(data.note||'Credit collection').replace(/[<>]/g,''),scope.businessDayId,user.id,`${idempotency}:ledger`]);const collection=await tx.run(`INSERT INTO customer_credit_collections(customer_id,amount,payment_method,provider,reference_number,cash_tendered,change_amount,business_day_id,store_session_id,ledger_id,created_by,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[customerId,fromMinor(amountMinor),method,String(data.provider||'')||null,String(data.reference_number||'')||null,tenderedMinor==null?null:fromMinor(tenderedMinor),method==='cash'?fromMinor(tenderedMinor-amountMinor):0,scope.businessDayId,scope.sessionId,ledger.lastInsertRowid,user.id,idempotency]);return {collectionId:collection.lastInsertRowid,customer:customer.name,amount:fromMinor(amountMinor),change:method==='cash'?fromMinor(tenderedMinor-amountMinor):0};});
    return NextResponse.json({message:'Customer credit collected',...result},{status:201});
  }catch(error){return NextResponse.json({error:error.message||'Unable to collect customer credit'},{status:error.status||(/not found/i.test(error.message)?404:400)});}
}
