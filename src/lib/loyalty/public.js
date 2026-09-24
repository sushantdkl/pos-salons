/**
 * PUBLIC REVIEW & REWARDS — what the permanent salon QR page may see and do.
 *
 * Returns only: first name, loyalty progress per program, a short activity list (date, program,
 * what happened) and recent visits to review (as signed references). Never phone, email, bill
 * numbers, amounts, other customers or staff details. Scanning/looking up never earns anything.
 */

import { normalizePhone } from '@/lib/validation/phone';
import { awardBill, customerBalances, getCrmSettings, httpError } from './service';
import { firstName, recentVisitsForReview } from '@/lib/reviews/service';

const ACTIVITY_LABEL = { EARN: 'Paid visit', REDEEM: 'Reward used', MANUAL_ADJUSTMENT: 'Adjusted by salon', EXPIRY: 'Expired' };

async function safeCard(db, customer, settings) {
  const balances = (await customerBalances(db, customer.id)).filter((row) => row.isActive);
  const activity = await db.all(`
    SELECT l.entry_type, l.visits, (l.created_at AT TIME ZONE 'Asia/Kathmandu')::date::text AS date, p.name AS program, i.name AS item, r.entry_type AS reversed
    FROM loyalty_ledger l JOIN loyalty_programs p ON p.id = l.program_id
    LEFT JOIN salon_bill_items i ON i.id = l.bill_item_id LEFT JOIN loyalty_ledger r ON r.id = l.reversal_of
    WHERE l.customer_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 8`, [customer.id]);
  return {
    found: true,
    firstName: firstName(customer.name),
    programs: balances.map((row) => ({
      programId: row.programId, name: row.name, requiredVisits: row.requiredVisits, progress: row.progress, available: row.available,
      remaining: row.remaining, rewardLabel: row.rewardLabel,
    })),
    activity: activity.map((row) => ({
      date: row.date, program: row.program, item: row.item || null, visits: Number(row.visits),
      label: row.entry_type === 'REVERSAL' ? (row.reversed === 'REDEEM' ? 'Reward returned' : 'Visit reversed') : ACTIVITY_LABEL[row.entry_type] || row.entry_type,
    })),
    visits: settings.publicReviewsEnabled ? await recentVisitsForReview(db, customer.id, settings.reviewWindowDays) : [],
  };
}

export async function lookupRewards(db, phone) {
  const settings = await getCrmSettings(db);
  if (!settings.publicRewardsEnabled && !settings.publicReviewsEnabled) throw httpError('Rewards are not available right now.', 403);
  const normalized = normalizePhone(phone);
  if (!normalized) throw httpError('Enter a valid 10-digit mobile number', 400);
  const customer = await db.get('SELECT id, name FROM customers WHERE phone = ?', [normalized]);
  // Unknown numbers get the same shape as a new customer — nothing more is revealed.
  if (!customer) return { found: false, firstName: null, programs: [], activity: [], visits: [] };
  const card = await safeCard(db, customer, settings);
  if (!settings.publicRewardsEnabled) { card.programs = []; card.activity = []; }
  return card;
}

/**
 * Join the rewards programme from the QR page before a first paid visit: name + mobile only.
 * Creates the customer with an empty card (visits still come only from paid bills). An existing
 * number is never changed or duplicated — the same safe card is returned either way, so this
 * reveals nothing about whether a number was already a customer.
 */
export async function joinRewards(db, { phone, name }) {
  const settings = await getCrmSettings(db);
  if (!settings.publicRewardsEnabled || !settings.publicJoinEnabled) throw httpError('Joining from this page is not available right now. Please ask at the counter.', 403);
  const normalized = normalizePhone(phone);
  if (!normalized) throw httpError('Enter a valid 10-digit mobile number', 400);
  const cleanName = String(name || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (cleanName.length < 2) throw httpError('Enter your name', 400);
  await db.transaction(async (tx) => {
    const existing = await tx.get('SELECT id FROM customers WHERE phone = ? FOR UPDATE', [normalized]);
    if (!existing) await tx.run('INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)', [cleanName, normalized, 'Joined rewards via Review & Rewards QR']);
  });
  return { joined: true, card: await lookupRewards(db, normalized) };
}

/**
 * Attach a walk-in visit to this phone number with the one-time code printed on the receipt.
 * The code is single use, expires, and only earns what that paid bill's lines would have earned.
 */
export async function claimVisit(db, { phone, code, name }) {
  const settings = await getCrmSettings(db);
  if (!settings.claimCodesEnabled || !settings.publicRewardsEnabled) throw httpError('Reward codes are not available right now.', 403);
  const normalized = normalizePhone(phone);
  if (!normalized) throw httpError('Enter a valid 10-digit mobile number', 400);
  const cleanCode = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) throw httpError('Enter the 6-character code from your receipt', 400);
  const invalid = () => httpError('That code is not valid, has expired, or has already been used.', 409, { code: 'INVALID_CLAIM' });
  await db.transaction(async (tx) => {
    const claim = await tx.get('SELECT * FROM loyalty_claim_codes WHERE code = ? FOR UPDATE', [cleanCode]);
    if (!claim || claim.claimed_at || new Date(claim.expires_at) <= new Date()) throw invalid();
    const bill = await tx.get('SELECT id, status, payment_status, customer_id FROM salon_bills WHERE id = ? FOR UPDATE', [claim.bill_id]);
    if (!bill || bill.status !== 'paid' || bill.payment_status !== 'paid' || bill.customer_id) throw invalid();
    let customer = await tx.get('SELECT id FROM customers WHERE phone = ? FOR UPDATE', [normalized]);
    if (!customer) {
      const cleanName = String(name || '').replace(/[<>]/g, '').trim().slice(0, 60) || 'Customer';
      const result = await tx.run('INSERT INTO customers (name, phone, notes) VALUES (?, ?, ?)', [cleanName, normalized, 'Joined via Review & Rewards QR']);
      customer = { id: Number(result.lastInsertRowid) };
    }
    await awardBill(tx, { billId: bill.id, customerId: customer.id, source: 'CLAIM_CODE' });
    await tx.run('UPDATE loyalty_claim_codes SET claimed_at = NOW(), claimed_customer_id = ? WHERE id = ?', [customer.id, claim.id]);
  });
  return lookupRewards(db, normalized);
}
