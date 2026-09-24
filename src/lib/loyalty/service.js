/**
 * DIGITAL SERVICE LOYALTY — an auditable ledger, never a mutable counter.
 *
 *   balance (per customer × program) = SUM(loyalty_ledger.visits)
 *   rewards available = floor(balance / required)      progress = balance − available × required
 *
 *   EARN       +1 for each eligible service line of a FULLY PAID bill, once (unique index).
 *              The line that was itself the free reward does not earn (unless the program says so).
 *   REDEEM     −required when a reward is applied at the POS (the bill gets a discount).
 *   REVERSAL   undoes one EARN or REDEEM (bill voided); history is never deleted.
 *   MANUAL_ADJUSTMENT  admin only, with reason, before / after.
 *
 * The public QR never earns anything: earning happens only here, from a completed bill,
 * either automatically (customer on the bill) or through a one-time claim code (walk-in).
 * Reviews play no part in earning — a 1★ visit earns exactly like a 5★ visit.
 */

import { randomInt } from 'node:crypto';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function httpError(message, status = 400, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

function text(value, fallback = null) {
  const cleaned = String(value ?? '').replace(/[<>]/g, '').trim();
  return cleaned || fallback;
}

export async function crmAudit(tx, { entityType, entityId = null, customerId = null, action, oldValue = null, newValue = null, reason = null, actorId = null }) {
  await tx.run(`INSERT INTO crm_audit_log(entity_type, entity_id, customer_id, action, old_value, new_value, reason, actor_id) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)`,
    [entityType, entityId, customerId, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, reason, actorId]);
}

export async function getCrmSettings(db) {
  const row = await db.get('SELECT * FROM crm_settings WHERE id = 1');
  return {
    publicRewardsEnabled: row?.public_rewards_enabled !== false,
    publicReviewsEnabled: row?.public_reviews_enabled !== false,
    generalFeedbackEnabled: row?.general_feedback_enabled !== false,
    claimCodesEnabled: row?.claim_codes_enabled !== false,
    claimCodeValidDays: Number(row?.claim_code_valid_days || 7),
    reviewWindowDays: Number(row?.review_window_days || 14),
    websiteReviewsEnabled: row?.website_reviews_enabled !== false,
    receiptQrEnabled: row?.receipt_qr_enabled !== false,
    qrHeadline: row?.qr_headline || 'LOVE YOUR LOOK?',
    qrSubtext: row?.qr_subtext || 'Scan to leave a review & check your rewards.',
    qrFooter: row?.qr_footer || '',
    lowRatingThreshold: Number(row?.low_rating_threshold || 2),
  };
}

export async function updateCrmSettings(db, actor, input) {
  const current = await getCrmSettings(db);
  const next = { ...current };
  for (const key of ['publicRewardsEnabled', 'publicReviewsEnabled', 'generalFeedbackEnabled', 'claimCodesEnabled', 'websiteReviewsEnabled', 'receiptQrEnabled']) {
    if (input[key] !== undefined) next[key] = Boolean(input[key]);
  }
  const int = (value, label, min, max) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw httpError(`${label} must be ${min}–${max}`);
    return number;
  };
  if (input.claimCodeValidDays !== undefined) next.claimCodeValidDays = int(input.claimCodeValidDays, 'Claim code validity', 1, 60);
  if (input.reviewWindowDays !== undefined) next.reviewWindowDays = int(input.reviewWindowDays, 'Review window', 1, 90);
  if (input.lowRatingThreshold !== undefined) next.lowRatingThreshold = int(input.lowRatingThreshold, 'Low rating alert', 1, 4);
  for (const key of ['qrHeadline', 'qrSubtext', 'qrFooter']) {
    if (input[key] !== undefined) next[key] = String(input[key] ?? '').replace(/[<>]/g, '').trim().slice(0, 120);
  }
  if (!next.qrHeadline) throw httpError('The QR headline cannot be empty');
  await db.transaction(async (tx) => {
    await tx.run(`UPDATE crm_settings SET public_rewards_enabled = ?, public_reviews_enabled = ?, general_feedback_enabled = ?, claim_codes_enabled = ?,
      claim_code_valid_days = ?, review_window_days = ?, website_reviews_enabled = ?, receipt_qr_enabled = ?, qr_headline = ?, qr_subtext = ?, qr_footer = ?,
      low_rating_threshold = ?, updated_by = ?, updated_at = NOW() WHERE id = 1`,
    [next.publicRewardsEnabled, next.publicReviewsEnabled, next.generalFeedbackEnabled, next.claimCodesEnabled, next.claimCodeValidDays, next.reviewWindowDays,
      next.websiteReviewsEnabled, next.receiptQrEnabled, next.qrHeadline, next.qrSubtext, next.qrFooter, next.lowRatingThreshold, actor.id]);
    await crmAudit(tx, { entityType: 'crm_settings', entityId: 1, action: 'update', oldValue: current, newValue: next, actorId: actor.id });
  });
  return next;
}

/* ================================================================ programs */

function mapProgram(row) {
  return {
    id: Number(row.id), name: row.name, ruleType: row.rule_type,
    eligibleServiceIds: (row.eligible_service_ids || []).map(Number), eligibleCategories: row.eligible_categories || [],
    requiredVisits: Number(row.required_visits), rewardType: row.reward_type,
    rewardServiceId: row.reward_service_id ? Number(row.reward_service_id) : null, rewardServiceName: row.reward_service_name || null,
    rewardValue: round2(row.reward_value), rewardLabel: row.reward_label, rewardCountsAsVisit: row.reward_counts_as_visit,
    startDate: row.start_date, endDate: row.end_date, isActive: row.is_active,
  };
}

const PROGRAM_SELECT = `SELECT p.*, p.start_date::text AS start_date, p.end_date::text AS end_date, s.name AS reward_service_name
  FROM loyalty_programs p LEFT JOIN salon_services s ON s.id = p.reward_service_id`;

export async function listPrograms(db, { activeOn = null } = {}) {
  const rows = activeOn
    ? await db.all(`${PROGRAM_SELECT} WHERE p.is_active AND p.start_date <= ?::date AND (p.end_date IS NULL OR p.end_date >= ?::date) ORDER BY p.id`, [activeOn, activeOn])
    : await db.all(`${PROGRAM_SELECT} ORDER BY p.is_active DESC, p.id`);
  return rows.map(mapProgram);
}

export async function saveProgram(db, actor, id, input) {
  const name = text(input.name);
  if (!name) throw httpError('Program name is required');
  const serviceIds = [...new Set((input.eligibleServiceIds || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  const categories = [...new Set((input.eligibleCategories || []).map((value) => text(value)).filter(Boolean))];
  if (!serviceIds.length && !categories.length) throw httpError('Choose at least one eligible service or category');
  const required = Number(input.requiredVisits);
  if (!Number.isInteger(required) || required < 1 || required > 100) throw httpError('Required paid visits must be 1–100');
  const rewardType = String(input.rewardType || 'FREE_SERVICE');
  if (!['FREE_SERVICE', 'FIXED_DISCOUNT', 'PERCENTAGE_DISCOUNT'].includes(rewardType)) throw httpError('Choose a reward type');
  const rewardServiceId = rewardType === 'FREE_SERVICE' ? Number(input.rewardServiceId || serviceIds[0] || 0) || null : null;
  if (rewardType === 'FREE_SERVICE' && !rewardServiceId) throw httpError('Choose the free service');
  const rewardValue = rewardType === 'FREE_SERVICE' ? 0 : round2(input.rewardValue);
  if (rewardType !== 'FREE_SERVICE' && !(rewardValue > 0)) throw httpError('Enter the reward amount');
  if (rewardType === 'PERCENTAGE_DISCOUNT' && rewardValue > 100) throw httpError('A percentage reward cannot exceed 100');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(input.startDate || '') ? input.startDate : null;
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(input.endDate || '') ? input.endDate : null;
  if (startDate && endDate && endDate < startDate) throw httpError('End date is before start date');
  return db.transaction(async (tx) => {
    if (rewardServiceId && !(await tx.get('SELECT id FROM salon_services WHERE id = ?', [rewardServiceId]))) throw httpError('The free service does not exist');
    const rewardService = rewardServiceId ? await tx.get('SELECT name FROM salon_services WHERE id = ?', [rewardServiceId]) : null;
    const label = text(input.rewardLabel) || (rewardType === 'FREE_SERVICE' ? `Free ${rewardService.name}` : rewardType === 'FIXED_DISCOUNT' ? `Rs ${rewardValue} off` : `${rewardValue}% off`);
    const duplicate = await tx.get('SELECT id FROM loyalty_programs WHERE LOWER(name) = LOWER(?) AND id <> ?', [name, Number(id || 0)]);
    if (duplicate) throw httpError('A program with this name already exists', 409);
    const values = [name, `{${serviceIds.join(',')}}`, `{${categories.map((c) => `"${c.replaceAll('"', '')}"`).join(',')}}`, required, rewardType, rewardServiceId, rewardValue, label,
      Boolean(input.rewardCountsAsVisit), startDate, endDate, input.isActive !== false];
    let programId = Number(id || 0);
    if (programId) {
      const old = await tx.get(`${PROGRAM_SELECT} WHERE p.id = ? FOR UPDATE OF p`, [programId]);
      if (!old) throw httpError('Program not found', 404);
      if (Number(old.required_visits) !== required) {
        const used = await tx.get('SELECT COUNT(*)::int AS n FROM loyalty_ledger WHERE program_id = ?', [programId]);
        if (used.n > 0) throw httpError('Required visits cannot change once customers have progress. End this program and start a new one.', 409);
      }
      await tx.run(`UPDATE loyalty_programs SET name = ?, eligible_service_ids = ?::bigint[], eligible_categories = ?::text[], required_visits = ?, reward_type = ?, reward_service_id = ?,
        reward_value = ?, reward_label = ?, reward_counts_as_visit = ?, start_date = COALESCE(?::date, start_date), end_date = ?::date, is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`, [...values, actor.id, programId]);
      await crmAudit(tx, { entityType: 'loyalty_program', entityId: programId, action: 'update', oldValue: mapProgram(old), newValue: { name, required, rewardType, label }, actorId: actor.id });
    } else {
      const result = await tx.run(`INSERT INTO loyalty_programs(name, eligible_service_ids, eligible_categories, required_visits, reward_type, reward_service_id, reward_value, reward_label,
        reward_counts_as_visit, start_date, end_date, is_active, created_by, updated_by) VALUES (?, ?::bigint[], ?::text[], ?, ?, ?, ?, ?, ?, COALESCE(?::date, CURRENT_DATE), ?::date, ?, ?, ?)`, [...values, actor.id, actor.id]);
      programId = Number(result.lastInsertRowid);
      await crmAudit(tx, { entityType: 'loyalty_program', entityId: programId, action: 'create', newValue: { name, required, rewardType, label }, actorId: actor.id });
    }
    return mapProgram(await tx.get(`${PROGRAM_SELECT} WHERE p.id = ?`, [programId]));
  });
}

function eligible(program, item) {
  if (item.item_type !== 'service') return false;
  if (program.eligibleServiceIds.includes(Number(item.item_id))) return true;
  return Boolean(item.category) && program.eligibleCategories.map((c) => c.toLowerCase()).includes(String(item.category).toLowerCase());
}

/* ================================================================ balances */

/**
 * Card maths from the raw ledger balance. A negative balance (a voided visit whose stamp was
 * already spent on a reward) is owed back: no reward, and the shortfall adds to visits remaining.
 */
export function cardFor(rawBalance, required) {
  const balance = Number(rawBalance) || 0;
  if (balance < 0) return { balance, available: 0, progress: 0, remaining: required - balance };
  const available = Math.floor(balance / required);
  const progress = balance - available * required;
  return { balance, available, progress, remaining: required - progress };
}

export async function customerBalances(db, customerId, { includeInactive = false } = {}) {
  const rows = await db.all(`
    SELECT p.id AS program_id, COALESCE(SUM(l.visits), 0)::int AS balance,
           MAX(l.created_at) FILTER (WHERE l.entry_type = 'EARN') AS last_earn,
           MAX(l.created_at) FILTER (WHERE l.entry_type = 'REDEEM') AS last_redeem,
           COUNT(*) FILTER (WHERE l.entry_type = 'REDEEM')::int AS redeems,
           COUNT(*) FILTER (WHERE l.entry_type = 'REVERSAL' AND r.entry_type = 'REDEEM')::int AS redeem_reversals,
           COUNT(*) FILTER (WHERE l.entry_type = 'EARN')::int AS earns,
           COUNT(*) FILTER (WHERE l.entry_type = 'REVERSAL' AND r.entry_type = 'EARN')::int AS earn_reversals,
           COUNT(*) FILTER (WHERE l.entry_type = 'MANUAL_ADJUSTMENT')::int AS adjustments
    FROM loyalty_programs p
    LEFT JOIN loyalty_ledger l ON l.program_id = p.id AND l.customer_id = ?
    LEFT JOIN loyalty_ledger r ON r.id = l.reversal_of
    ${includeInactive ? '' : 'WHERE p.is_active'}
    GROUP BY p.id
  `, [customerId]);
  const programs = await listPrograms(db);
  return rows.map((row) => {
    const program = programs.find((p) => p.id === Number(row.program_id));
    const { balance, available, progress, remaining } = cardFor(Number(row.balance), program.requiredVisits);
    return {
      programId: program.id, name: program.name, requiredVisits: program.requiredVisits, rewardLabel: program.rewardLabel, rewardType: program.rewardType,
      rewardServiceId: program.rewardServiceId, rewardServiceName: program.rewardServiceName, rewardValue: program.rewardValue, isActive: program.isActive,
      balance, available, progress, remaining,
      paidVisits: Number(row.earns) - Number(row.earn_reversals), redeemed: Number(row.redeems) - Number(row.redeem_reversals), adjustments: Number(row.adjustments),
      lastEarnAt: row.last_earn, lastRedeemAt: row.last_redeem, enrolled: Number(row.earns) + Number(row.adjustments) > 0,
    };
  }).sort((a, b) => a.programId - b.programId);
}

/* ================================================================ POS: redeem + earn */

/**
 * Work out a reward for a bill being created. Runs inside the billing transaction with the
 * customer row locked, before the bill is inserted. Returns the discount and which service line
 * it applies to. It never touches payment rows: the reward is a discount.
 */
export async function planRedemption(tx, { customerId, programId, serviceRows, amountAfterDiscount }) {
  if (!customerId) throw httpError('Select the customer to apply a loyalty reward', 400);
  await tx.get('SELECT id FROM customers WHERE id = ? FOR UPDATE', [customerId]);
  const program = (await listPrograms(tx)).find((p) => p.id === Number(programId));
  if (!program || !program.isActive) throw httpError('That loyalty program is not active', 409);
  const balance = Number((await tx.get('SELECT COALESCE(SUM(visits), 0)::int AS balance FROM loyalty_ledger WHERE customer_id = ? AND program_id = ?', [customerId, program.id])).balance);
  if (balance < program.requiredVisits) throw httpError('No reward is available for this customer', 409, { code: 'NO_REWARD' });
  let discount = 0;
  let rewardIndex = -1;
  if (program.rewardType === 'FREE_SERVICE') {
    rewardIndex = serviceRows.findIndex((row) => Number(row.item_id) === program.rewardServiceId);
    if (rewardIndex < 0) throw httpError(`Add ${program.rewardServiceName || 'the reward service'} to the bill to use the free reward`, 409, { code: 'REWARD_SERVICE_MISSING' });
    discount = Number(serviceRows[rewardIndex].unit_price);
  } else if (program.rewardType === 'FIXED_DISCOUNT') {
    discount = program.rewardValue;
  } else {
    discount = round2(amountAfterDiscount * program.rewardValue / 100);
  }
  discount = round2(Math.min(discount, amountAfterDiscount));
  if (discount <= 0) throw httpError('This bill has nothing left to discount', 409);
  return { program, discount, rewardIndex, balance };
}

export async function recordRedemption(tx, { customerId, program, billId, billItemId, balance, actorId }) {
  await tx.run(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, source, balance_before, balance_after, note, created_by)
    VALUES (?, ?, ?, ?, 'REDEEM', ?, 'POS', ?, ?, ?, ?)`,
  [customerId, program.id, billId, billItemId || null, -program.requiredVisits, balance, balance - program.requiredVisits, program.rewardLabel, actorId]);
}

/**
 * Award stamps for a bill. Only a paid, fully-collected, non-voided bill earns. Safe to call any
 * number of times: the unique (program, bill line) index makes every repeat a no-op.
 */
export async function awardBill(tx, { billId, customerId, source = 'POS', actorId = null }) {
  const bill = await tx.get(`SELECT id, status, payment_status, customer_id, COALESCE(revenue_business_day_id, business_day_id) AS day_id,
    (transaction_time AT TIME ZONE 'Asia/Kathmandu')::date::text AS bill_date FROM salon_bills WHERE id = ?`, [billId]);
  if (!bill || bill.status !== 'paid' || bill.payment_status !== 'paid') return { earned: 0 };
  const owner = Number(customerId || bill.customer_id || 0);
  if (!owner) return { earned: 0 };
  const programs = await listPrograms(tx, { activeOn: bill.bill_date });
  if (!programs.length) return { earned: 0 };
  const items = await tx.all(`SELECT i.id, i.item_type, i.item_id, i.loyalty_reward, s.category FROM salon_bill_items i
    LEFT JOIN salon_services s ON i.item_type = 'service' AND s.id = i.item_id WHERE i.bill_id = ? ORDER BY i.id`, [billId]);
  let earned = 0;
  for (const program of programs) {
    for (const item of items) {
      if (!eligible(program, item)) continue;
      if (item.loyalty_reward && !program.rewardCountsAsVisit) continue;
      const result = await tx.run(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, source, created_by)
        VALUES (?, ?, ?, ?, 'EARN', 1, ?, ?) ON CONFLICT (program_id, bill_item_id) WHERE entry_type = 'EARN' DO NOTHING`, [owner, program.id, billId, item.id, source, actorId]);
      earned += Number(result.rowCount || 0);
    }
  }
  return { earned };
}

/** Does this bill have any line some active program would reward? (for claim codes) */
export async function billHasEligibleLines(tx, billId) {
  const bill = await tx.get(`SELECT (transaction_time AT TIME ZONE 'Asia/Kathmandu')::date::text AS bill_date FROM salon_bills WHERE id = ?`, [billId]);
  const programs = await listPrograms(tx, { activeOn: bill.bill_date });
  if (!programs.length) return false;
  const items = await tx.all(`SELECT i.item_type, i.item_id, i.loyalty_reward, s.category FROM salon_bill_items i
    LEFT JOIN salon_services s ON i.item_type = 'service' AND s.id = i.item_id WHERE i.bill_id = ?`, [billId]);
  return programs.some((program) => items.some((item) => eligible(program, item) && (!item.loyalty_reward || program.rewardCountsAsVisit)));
}

export async function createClaimCode(tx, billId, validDays) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    const result = await tx.run(`INSERT INTO loyalty_claim_codes(bill_id, code, expires_at) VALUES (?, ?, NOW() + (? || ' days')::interval)
      ON CONFLICT DO NOTHING RETURNING code`, [billId, code, String(validDays)]);
    if (result.rowCount) return code;
    const existing = await tx.get('SELECT code FROM loyalty_claim_codes WHERE bill_id = ?', [billId]);
    if (existing) return existing.code;
  }
  throw httpError('Could not create a claim code');
}

/**
 * Bill voided: reverse every EARN and REDEEM it produced (a REDEEM reversal gives the reward
 * back). Unclaimed claim codes die with the bill. Idempotent via the unique reversal index.
 */
export async function reverseBill(tx, { billId, actorId, reason }) {
  const entries = await tx.all(`SELECT l.* FROM loyalty_ledger l WHERE l.bill_id = ? AND l.entry_type IN ('EARN', 'REDEEM')
    AND NOT EXISTS (SELECT 1 FROM loyalty_ledger r WHERE r.reversal_of = l.id)`, [billId]);
  for (const entry of entries) {
    await tx.run(`INSERT INTO loyalty_ledger(customer_id, program_id, bill_id, bill_item_id, entry_type, visits, reversal_of, source, note, created_by)
      VALUES (?, ?, ?, ?, 'REVERSAL', ?, ?, 'VOID', ?, ?) ON CONFLICT (reversal_of) WHERE entry_type = 'REVERSAL' DO NOTHING`,
    [entry.customer_id, entry.program_id, billId, entry.bill_item_id, -Number(entry.visits), entry.id, text(reason, 'Bill voided'), actorId]);
  }
  await tx.run('UPDATE loyalty_claim_codes SET expires_at = LEAST(expires_at, NOW()) WHERE bill_id = ? AND claimed_at IS NULL', [billId]);
  return { reversed: entries.length };
}

/* ================================================================ admin */

export async function adjustVisits(db, actor, { customerId, programId, visits, reason }) {
  const why = text(reason);
  if (!why) throw httpError('A reason is required');
  const amount = Number(visits);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 50) throw httpError('Adjustment must be a whole number of visits (±1 to ±50)');
  return db.transaction(async (tx) => {
    const customer = await tx.get('SELECT id FROM customers WHERE id = ? FOR UPDATE', [Number(customerId)]);
    if (!customer) throw httpError('Customer not found', 404);
    const program = await tx.get('SELECT id FROM loyalty_programs WHERE id = ?', [Number(programId)]);
    if (!program) throw httpError('Program not found', 404);
    const before = Number((await tx.get('SELECT COALESCE(SUM(visits), 0)::int AS b FROM loyalty_ledger WHERE customer_id = ? AND program_id = ?', [customer.id, program.id])).b);
    if (before + amount < 0) throw httpError(`The customer only has ${before} visit(s) in this program`, 409);
    const result = await tx.run(`INSERT INTO loyalty_ledger(customer_id, program_id, entry_type, visits, source, balance_before, balance_after, note, created_by)
      VALUES (?, ?, 'MANUAL_ADJUSTMENT', ?, 'ADMIN', ?, ?, ?, ?)`, [customer.id, program.id, amount, before, before + amount, why, actor.id]);
    await crmAudit(tx, { entityType: 'loyalty_ledger', entityId: Number(result.lastInsertRowid), customerId: customer.id, action: 'manual_adjustment', oldValue: { balance: before }, newValue: { adjustment: amount, balance: before + amount }, reason: why, actorId: actor.id });
    return { before, adjustment: amount, after: before + amount };
  });
}

export async function listTransactions(db, { customerId = null, programId = null, limit = 200 } = {}) {
  const clauses = [];
  const params = [];
  if (customerId) { clauses.push('l.customer_id = ?'); params.push(Number(customerId)); }
  if (programId) { clauses.push('l.program_id = ?'); params.push(Number(programId)); }
  params.push(Math.min(Number(limit) || 200, 1000));
  const rows = await db.all(`SELECT l.id, l.customer_id, c.name AS customer_name, c.phone, l.program_id, p.name AS program_name, l.bill_id, b.bill_number,
      l.entry_type, l.visits, l.source, l.balance_before, l.balance_after, l.note, l.created_at, COALESCE(u.full_name, u.username) AS created_by_name,
      i.name AS item_name, r.entry_type AS reversed_type
    FROM loyalty_ledger l JOIN customers c ON c.id = l.customer_id JOIN loyalty_programs p ON p.id = l.program_id
    LEFT JOIN salon_bills b ON b.id = l.bill_id LEFT JOIN salon_bill_items i ON i.id = l.bill_item_id
    LEFT JOIN users u ON u.id = l.created_by LEFT JOIN loyalty_ledger r ON r.id = l.reversal_of
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY l.created_at DESC, l.id DESC LIMIT ?`, params);
  return rows.map((row) => ({
    id: Number(row.id), customerId: Number(row.customer_id), customerName: row.customer_name, phone: row.phone, programId: Number(row.program_id), programName: row.program_name,
    billId: row.bill_id ? Number(row.bill_id) : null, billNumber: row.bill_number, itemName: row.item_name, type: row.entry_type, reversedType: row.reversed_type,
    visits: Number(row.visits), source: row.source, balanceBefore: row.balance_before, balanceAfter: row.balance_after, note: row.note, at: row.created_at, by: row.created_by_name,
  }));
}

/** Per customer × program progress table + program-wide totals. */
export async function loyaltyOverview(db, { programId = null } = {}) {
  const programs = await listPrograms(db);
  const rows = await db.all(`
    SELECT l.customer_id, l.program_id, c.name, c.phone, COALESCE(SUM(l.visits), 0)::int AS balance,
           COUNT(*) FILTER (WHERE l.entry_type = 'EARN')::int AS earns,
           COUNT(*) FILTER (WHERE l.entry_type = 'REVERSAL' AND r.entry_type = 'EARN')::int AS earn_reversals,
           COUNT(*) FILTER (WHERE l.entry_type = 'REDEEM')::int AS redeems,
           COUNT(*) FILTER (WHERE l.entry_type = 'REVERSAL' AND r.entry_type = 'REDEEM')::int AS redeem_reversals,
           MAX(l.created_at) FILTER (WHERE l.entry_type = 'EARN') AS last_earn,
           MAX(l.created_at) FILTER (WHERE l.entry_type = 'REDEEM') AS last_redeem
    FROM loyalty_ledger l JOIN customers c ON c.id = l.customer_id LEFT JOIN loyalty_ledger r ON r.id = l.reversal_of
    ${programId ? 'WHERE l.program_id = ?' : ''}
    GROUP BY l.customer_id, l.program_id, c.name, c.phone
  `, programId ? [Number(programId)] : []);
  const customers = rows.map((row) => {
    const program = programs.find((p) => p.id === Number(row.program_id));
    const { balance, available, progress, remaining } = cardFor(Number(row.balance), program.requiredVisits);
    return {
      customerId: Number(row.customer_id), name: row.name, phone: row.phone, programId: program.id, programName: program.name, requiredVisits: program.requiredVisits,
      rewardLabel: program.rewardLabel, balance, available, progress, remaining,
      paidVisits: Number(row.earns) - Number(row.earn_reversals), redeemed: Number(row.redeems) - Number(row.redeem_reversals),
      lastEarnAt: row.last_earn, lastRedeemAt: row.last_redeem,
    };
  }).sort((a, b) => b.available - a.available || b.progress - a.progress || String(a.name).localeCompare(String(b.name)));
  const redeemed = customers.reduce((sum, row) => sum + row.redeemed, 0);
  const outstanding = customers.reduce((sum, row) => sum + row.available, 0);
  const earned = redeemed + outstanding;
  return {
    programs,
    customers,
    totals: {
      enrolled: new Set(customers.filter((row) => row.paidVisits > 0 || row.balance > 0).map((row) => row.customerId)).size,
      eligibleVisits: customers.reduce((sum, row) => sum + row.paidVisits, 0),
      rewardsEarned: earned,
      rewardsRedeemed: redeemed,
      outstandingRewards: outstanding,
      redemptionRate: earned ? Math.round((redeemed / earned) * 1000) / 10 : null,
      nearReward: customers.filter((row) => row.available === 0 && row.remaining === 1).length,
    },
  };
}
