/**
 * CUSTOMER REVIEWS & FEEDBACK FORMS.
 *
 * Every response starts PENDING and private. Moderation only decides PUBLIC display — negative
 * feedback is never deleted. Only PUBLISHED reviews with the customer's public consent reach the
 * website, showing first name, rating, text, date and service — never phone, email or money.
 *
 * Verified review = linked to a paid, non-voided bill of the identified customer, within the
 * review window; one per bill (unique index; an admin can re-open with a reason). The browser
 * only ever holds a signed, short-lived visit reference — never a raw bill id it could change.
 * Reviews and loyalty are independent: a rating never affects earned visits.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { crmAudit, getCrmSettings, httpError } from '@/lib/loyalty/service';

const QUESTION_TYPES = ['STAR', 'TEXT', 'SINGLE', 'MULTI', 'YES_NO'];
const STATUSES = ['PENDING', 'PUBLISHED', 'PRIVATE', 'REJECTED', 'ARCHIVED'];
const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

function text(value, max = 2000) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max) || null;
}

export function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (!first || /^walk-?in$/i.test(first) || /^customer$/i.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/* ================================================================ signed visit references */

function signingKey() {
  const secret = process.env.REVIEW_SIGNING_SECRET || `review-ref:${process.env.DATABASE_URL || ''}`;
  return createHash('sha256').update(secret).digest();
}

export function signVisit(billId, customerId, ttlMinutes = 60) {
  const expires = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
  const payload = `${billId}.${customerId}.${expires}`;
  const mac = createHmac('sha256', signingKey()).update(payload).digest('base64url').slice(0, 22);
  return Buffer.from(`${payload}.${mac}`).toString('base64url');
}

export function verifyVisit(ref) {
  try {
    const [billId, customerId, expires, mac] = Buffer.from(String(ref || ''), 'base64url').toString().split('.');
    const expected = createHmac('sha256', signingKey()).update(`${billId}.${customerId}.${expires}`).digest('base64url').slice(0, 22);
    if (!mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    if (Number(expires) < Date.now() / 1000) return null;
    return { billId: Number(billId), customerId: Number(customerId) };
  } catch {
    return null;
  }
}

/* ================================================================ forms */

function mapForm(row) {
  return {
    id: Number(row.id), name: row.name, description: row.description, status: row.status, isDefault: row.is_default,
    applicableServiceIds: (row.applicable_service_ids || []).map(Number), ratingEnabled: row.rating_enabled, reviewTextEnabled: row.review_text_enabled,
    staffFeedbackEnabled: row.staff_feedback_enabled, serviceFeedbackEnabled: row.service_feedback_enabled, publicConsentEnabled: row.public_consent_enabled,
    questions: row.questions || [], createdAt: row.created_at, updatedAt: row.updated_at,
    responses: row.responses !== undefined ? Number(row.responses) : undefined,
  };
}

export async function listForms(db) {
  const rows = await db.all(`SELECT f.*, (SELECT COUNT(*) FROM customer_reviews r WHERE r.form_id = f.id)::int AS responses FROM feedback_forms f ORDER BY f.is_default DESC, f.status, f.name`);
  return rows.map(mapForm);
}

function cleanQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  if (questions.length > 12) throw httpError('Keep a form to 12 questions or fewer');
  const seen = new Set();
  return questions.map((question, index) => {
    const type = String(question.type || '').toUpperCase();
    if (!QUESTION_TYPES.includes(type)) throw httpError(`Question ${index + 1}: choose a question type`);
    const label = text(question.label, 160);
    if (!label) throw httpError(`Question ${index + 1} needs a label`);
    let id = String(question.id || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `q${index + 1}`;
    while (seen.has(id)) id = `${id}_${index}`;
    seen.add(id);
    const options = ['SINGLE', 'MULTI'].includes(type) ? [...new Set((question.options || []).map((option) => text(option, 80)).filter(Boolean))] : undefined;
    if (options && options.length < 2) throw httpError(`Question ${index + 1} needs at least two choices`);
    if (options && options.length > 10) throw httpError(`Question ${index + 1}: at most 10 choices`);
    return { id, type, label, required: Boolean(question.required), ...(options ? { options } : {}) };
  });
}

export async function saveForm(db, actor, id, input) {
  const name = text(input.name, 120);
  if (!name) throw httpError('Form name is required');
  const status = ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(input.status) ? input.status : 'DRAFT';
  const questions = cleanQuestions(input.questions);
  const serviceIds = [...new Set((input.applicableServiceIds || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
  const values = [name, text(input.description, 400), status, `{${serviceIds.join(',')}}`, input.ratingEnabled !== false, input.reviewTextEnabled !== false,
    Boolean(input.staffFeedbackEnabled), input.serviceFeedbackEnabled !== false, input.publicConsentEnabled !== false, JSON.stringify(questions)];
  return db.transaction(async (tx) => {
    let formId = Number(id || 0);
    if (formId) {
      const old = await tx.get('SELECT * FROM feedback_forms WHERE id = ? FOR UPDATE', [formId]);
      if (!old) throw httpError('Form not found', 404);
      if (old.is_default && status !== 'ACTIVE') throw httpError('The default form must stay active. Make another form the default first.', 409);
      await tx.run(`UPDATE feedback_forms SET name = ?, description = ?, status = ?, applicable_service_ids = ?::bigint[], rating_enabled = ?, review_text_enabled = ?,
        staff_feedback_enabled = ?, service_feedback_enabled = ?, public_consent_enabled = ?, questions = ?::jsonb, updated_at = NOW() WHERE id = ?`, [...values, formId]);
      await crmAudit(tx, { entityType: 'feedback_form', entityId: formId, action: 'update', oldValue: { name: old.name, status: old.status }, newValue: { name, status, questions: questions.length }, actorId: actor.id });
    } else {
      const result = await tx.run(`INSERT INTO feedback_forms(name, description, status, applicable_service_ids, rating_enabled, review_text_enabled, staff_feedback_enabled,
        service_feedback_enabled, public_consent_enabled, questions, created_by) VALUES (?, ?, ?, ?::bigint[], ?, ?, ?, ?, ?, ?::jsonb, ?)`, [...values, actor.id]);
      formId = Number(result.lastInsertRowid);
      await crmAudit(tx, { entityType: 'feedback_form', entityId: formId, action: 'create', newValue: { name, status }, actorId: actor.id });
    }
    if (input.isDefault) {
      if (status !== 'ACTIVE') throw httpError('Only an active form can be the default');
      await tx.run('UPDATE feedback_forms SET is_default = FALSE WHERE is_default AND id <> ?', [formId]);
      await tx.run('UPDATE feedback_forms SET is_default = TRUE WHERE id = ?', [formId]);
    }
    return mapForm(await tx.get('SELECT * FROM feedback_forms WHERE id = ?', [formId]));
  });
}

/** The form the QR page shows: an active form for the reviewed service, else the default. */
export async function publicForm(db, { serviceIds = [] } = {}) {
  const forms = (await listForms(db)).filter((form) => form.status === 'ACTIVE');
  const specific = forms.find((form) => form.applicableServiceIds.some((id) => serviceIds.includes(id)));
  const form = specific || forms.find((row) => row.isDefault) || forms[0] || null;
  if (!form) return null;
  return {
    id: form.id, name: form.name, description: form.description, ratingEnabled: form.ratingEnabled, reviewTextEnabled: form.reviewTextEnabled,
    publicConsentEnabled: form.publicConsentEnabled, questions: form.questions,
  };
}

/* ================================================================ submit (public) */

function cleanAnswers(form, answers) {
  const byId = new Map((Array.isArray(answers) ? answers : []).map((answer) => [String(answer?.id), answer?.value]));
  return form.questions.map((question) => {
    const raw = byId.get(question.id);
    let value = null;
    if (question.type === 'STAR') {
      const n = Number(raw);
      value = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
    } else if (question.type === 'TEXT') value = text(raw, 1000);
    else if (question.type === 'YES_NO') value = raw === true || raw === 'yes' ? 'yes' : raw === false || raw === 'no' ? 'no' : null;
    else if (question.type === 'SINGLE') value = question.options.includes(raw) ? raw : null;
    else if (question.type === 'MULTI') value = Array.isArray(raw) ? raw.filter((option) => question.options.includes(option)).slice(0, 10) : null;
    if (question.required && (value === null || (Array.isArray(value) && !value.length))) throw httpError(`Please answer: ${question.label}`);
    return { id: question.id, label: question.label, type: question.type, value };
  }).filter((answer) => answer.value !== null && !(Array.isArray(answer.value) && !answer.value.length));
}

export async function recentVisitsForReview(db, customerId, windowDays) {
  const rows = await db.all(`
    SELECT b.id, (b.transaction_time AT TIME ZONE 'Asia/Kathmandu')::date::text AS visit_date,
           string_agg(i.name, ', ' ORDER BY i.id) FILTER (WHERE i.item_type = 'service') AS services
    FROM salon_bills b JOIN salon_bill_items i ON i.bill_id = b.id
    WHERE b.customer_id = ? AND b.status = 'paid' AND b.transaction_time >= NOW() - (? || ' days')::interval
      AND NOT EXISTS (SELECT 1 FROM customer_reviews r WHERE r.bill_id = b.id AND NOT r.superseded)
    GROUP BY b.id ORDER BY b.transaction_time DESC LIMIT 5
  `, [customerId, String(windowDays)]);
  return rows.filter((row) => row.services).map((row) => ({ ref: signVisit(row.id, customerId), date: row.visit_date, services: row.services }));
}

export async function submitReview(db, input, { clientHash }) {
  const settings = await getCrmSettings(db);
  if (!settings.publicReviewsEnabled) throw httpError('Reviews are switched off at the moment.', 403);
  const rating = input.rating === undefined || input.rating === null || input.rating === '' ? null : Number(input.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw httpError('Choose 1 to 5 stars');
  const visit = input.visitRef ? verifyVisit(input.visitRef) : null;
  if (input.visitRef && !visit) throw httpError('This visit link has expired. Enter your number again to pick your visit.', 409, { code: 'VISIT_EXPIRED' });
  if (!visit && !settings.generalFeedbackEnabled) throw httpError('Choose your visit to leave a review.', 400);

  return db.transaction(async (tx) => {
    let customer = null;
    let bill = null;
    let items = [];
    if (visit) {
      bill = await tx.get(`SELECT id, customer_id, status, transaction_time FROM salon_bills WHERE id = ? FOR UPDATE`, [visit.billId]);
      if (!bill || Number(bill.customer_id) !== visit.customerId || bill.status !== 'paid') throw httpError('That visit cannot be reviewed.', 409);
      const windowStart = Date.now() - settings.reviewWindowDays * 86400000;
      if (new Date(bill.transaction_time).getTime() < windowStart) throw httpError('That visit is too old to review.', 409);
      customer = await tx.get('SELECT id, name FROM customers WHERE id = ?', [visit.customerId]);
      items = await tx.all(`SELECT item_id, staff_id FROM salon_bill_items WHERE bill_id = ? AND item_type = 'service' ORDER BY id`, [bill.id]);
    }
    const form = await publicForm(tx, { serviceIds: items.map((item) => Number(item.item_id)) });
    const formRow = input.formId ? await tx.get("SELECT * FROM feedback_forms WHERE id = ? AND status = 'ACTIVE'", [Number(input.formId)]) : null;
    const useForm = formRow ? mapForm(formRow) : form;
    if (!useForm) throw httpError('Feedback is not available right now.', 409);
    if (useForm.ratingEnabled && rating === null) throw httpError('Please choose a star rating.');
    const answers = cleanAnswers(useForm, input.answers);
    const reviewText = useForm.reviewTextEnabled ? text(input.text, 2000) : null;
    if (!rating && !reviewText && !answers.length) throw httpError('Please tell us something about your visit.');
    const chosenService = items.find((item) => Number(item.item_id) === Number(input.serviceId)) || items[0] || null;
    const consent = useForm.publicConsentEnabled ? Boolean(input.publicConsent) : false;
    const displayName = firstName(customer?.name || input.name);
    try {
      const result = await tx.run(`INSERT INTO customer_reviews(form_id, customer_id, bill_id, service_id, staff_id, overall_rating, answers, review_text, display_name,
        public_consent, verified, status, source, client_hash) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, 'PENDING', 'QR', ?)`,
      [useForm.id, customer?.id || null, bill?.id || null, chosenService ? Number(chosenService.item_id) : null, chosenService?.staff_id || null, rating,
        JSON.stringify(answers), reviewText, displayName, consent, Boolean(bill), clientHash]);
      return { id: Number(result.lastInsertRowid), verified: Boolean(bill), status: 'PENDING' };
    } catch (error) {
      if (error.code === '23505') throw httpError('You have already reviewed this visit. Thank you!', 409, { code: 'ALREADY_REVIEWED' });
      throw error;
    }
  });
}

/* ================================================================ moderation */

const REVIEW_SELECT = `SELECT r.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS service_name,
  COALESCE(NULLIF(sp.display_name, ''), u.full_name, u.username) AS staff_name, b.bill_number, f.name AS form_name,
  COALESCE(m.full_name, m.username) AS moderated_by_name
  FROM customer_reviews r LEFT JOIN customers c ON c.id = r.customer_id LEFT JOIN salon_services s ON s.id = r.service_id
  LEFT JOIN users u ON u.id = r.staff_id LEFT JOIN staff_profiles sp ON sp.user_id = r.staff_id LEFT JOIN salon_bills b ON b.id = r.bill_id
  LEFT JOIN feedback_forms f ON f.id = r.form_id LEFT JOIN users m ON m.id = r.moderated_by`;

function mapReview(row) {
  return {
    id: Number(row.id), formName: row.form_name, customerId: row.customer_id ? Number(row.customer_id) : null, customerName: row.customer_name, customerPhone: row.customer_phone,
    displayName: row.display_name, billId: row.bill_id ? Number(row.bill_id) : null, billNumber: row.bill_number, serviceName: row.service_name, staffName: row.staff_name,
    rating: row.overall_rating ? Number(row.overall_rating) : null, answers: row.answers || [], text: row.review_text, publicConsent: row.public_consent,
    verified: row.verified, status: row.status, superseded: row.superseded, submittedAt: row.submitted_at,
    moderatedBy: row.moderated_by_name, moderatedAt: row.moderated_at, moderationNote: row.moderation_note,
  };
}

export async function listReviews(db, { status = null, maxRating = null, verified = null, customerId = null, limit = 300 } = {}) {
  const clauses = [];
  const params = [];
  if (status) { clauses.push('r.status = ?'); params.push(status); }
  if (maxRating) { clauses.push('r.overall_rating <= ?'); params.push(Number(maxRating)); }
  if (verified !== null) { clauses.push('r.verified = ?'); params.push(Boolean(verified)); }
  if (customerId) { clauses.push('r.customer_id = ?'); params.push(Number(customerId)); }
  params.push(Math.min(Number(limit) || 300, 1000));
  return (await db.all(`${REVIEW_SELECT} ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY r.submitted_at DESC LIMIT ?`, params)).map(mapReview);
}

export async function moderateReview(db, actor, id, { status, note }) {
  if (!STATUSES.includes(status) || status === 'PENDING') throw httpError('Choose Publish, Keep private, Reject or Archive');
  return db.transaction(async (tx) => {
    const old = await tx.get('SELECT * FROM customer_reviews WHERE id = ? FOR UPDATE', [Number(id)]);
    if (!old) throw httpError('Review not found', 404);
    if (status === 'PUBLISHED' && !old.public_consent) throw httpError('The customer did not agree to public display. Keep it private instead.', 409, { code: 'NO_CONSENT' });
    if (status === 'PUBLISHED' && !old.review_text && !old.overall_rating) throw httpError('There is nothing to publish in this response.', 409);
    if (['REJECTED', 'ARCHIVED'].includes(status) && !text(note)) throw httpError('A note is required to reject or archive feedback');
    await tx.run('UPDATE customer_reviews SET status = ?, moderated_by = ?, moderated_at = NOW(), moderation_note = ? WHERE id = ?', [status, actor.id, text(note, 400), old.id]);
    await crmAudit(tx, { entityType: 'review', entityId: Number(old.id), customerId: old.customer_id, action: `moderate_${status.toLowerCase()}`, oldValue: { status: old.status }, newValue: { status }, reason: text(note, 400), actorId: actor.id });
    return mapReview(await tx.get(`${REVIEW_SELECT} WHERE r.id = ?`, [old.id]));
  });
}

/** Let the customer review this visit again (the old response stays, archived, in history). */
export async function reopenReview(db, actor, id, reason) {
  const why = text(reason, 400);
  if (!why) throw httpError('A reason is required to re-open a visit for review');
  return db.transaction(async (tx) => {
    const old = await tx.get('SELECT * FROM customer_reviews WHERE id = ? FOR UPDATE', [Number(id)]);
    if (!old) throw httpError('Review not found', 404);
    if (!old.bill_id || old.superseded) throw httpError('Only a current verified review can be re-opened', 409);
    await tx.run("UPDATE customer_reviews SET superseded = TRUE, status = CASE WHEN status = 'PUBLISHED' THEN 'ARCHIVED' ELSE status END, moderated_by = ?, moderated_at = NOW(), moderation_note = ? WHERE id = ?", [actor.id, why, old.id]);
    await crmAudit(tx, { entityType: 'review', entityId: Number(old.id), customerId: old.customer_id, action: 'reopen_visit', oldValue: { superseded: false }, newValue: { superseded: true }, reason: why, actorId: actor.id });
    return { ok: true };
  });
}

/* ================================================================ analytics */

const MIN_STAFF_SAMPLE = 5;

export async function reviewOverview(db, { from = null, to = null } = {}) {
  const settings = await getCrmSettings(db);
  const range = from && to ? "AND (r.submitted_at AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN ?::date AND ?::date" : '';
  const rangeParams = from && to ? [from, to] : [];
  const totals = await db.get(`SELECT COUNT(*)::int AS total, AVG(r.overall_rating) AS average,
      COUNT(*) FILTER (WHERE r.status = 'PENDING')::int AS pending, COUNT(*) FILTER (WHERE r.status = 'PUBLISHED')::int AS published,
      COUNT(*) FILTER (WHERE r.status = 'PRIVATE')::int AS private, COUNT(*) FILTER (WHERE r.verified)::int AS verified,
      COUNT(*) FILTER (WHERE date_trunc('month', r.submitted_at AT TIME ZONE 'Asia/Kathmandu') = date_trunc('month', NOW() AT TIME ZONE 'Asia/Kathmandu'))::int AS this_month
    FROM customer_reviews r WHERE r.status <> 'ARCHIVED' ${range}`, rangeParams);
  const breakdown = await db.all(`SELECT r.overall_rating AS stars, COUNT(*)::int AS n FROM customer_reviews r WHERE r.overall_rating IS NOT NULL AND r.status <> 'ARCHIVED' ${range} GROUP BY 1`, rangeParams);
  const visits = from && to
    ? await db.get(`SELECT COUNT(*)::int AS n FROM salon_bills b WHERE b.status = 'paid' AND b.customer_id IS NOT NULL AND (b.transaction_time AT TIME ZONE 'Asia/Kathmandu')::date BETWEEN ?::date AND ?::date`, [from, to])
    : null;
  const services = await db.all(`SELECT s.name, COUNT(*)::int AS n, AVG(r.overall_rating) AS avg FROM customer_reviews r JOIN salon_services s ON s.id = r.service_id
    WHERE r.status <> 'ARCHIVED' ${range} GROUP BY s.name ORDER BY n DESC LIMIT 8`, rangeParams);
  const staff = await db.all(`SELECT COALESCE(NULLIF(sp.display_name, ''), u.full_name, u.username) AS name, COUNT(*)::int AS n, AVG(r.overall_rating) AS avg
    FROM customer_reviews r JOIN users u ON u.id = r.staff_id LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    WHERE r.status <> 'ARCHIVED' AND r.overall_rating IS NOT NULL ${range} GROUP BY 1 ORDER BY n DESC`, rangeParams);
  const trend = await db.all(`SELECT to_char(date_trunc('month', r.submitted_at AT TIME ZONE 'Asia/Kathmandu'), 'YYYY-MM') AS month, COUNT(*)::int AS n, AVG(r.overall_rating) AS avg
    FROM customer_reviews r WHERE r.status <> 'ARCHIVED' AND r.submitted_at >= NOW() - INTERVAL '6 months' GROUP BY 1 ORDER BY 1`);
  const repeat = await db.get(`SELECT COUNT(*)::int AS n FROM (SELECT customer_id FROM customer_reviews WHERE customer_id IS NOT NULL AND status <> 'ARCHIVED' GROUP BY customer_id HAVING COUNT(*) > 1) x`);
  const lowRatings = await listReviews(db, { status: 'PENDING', maxRating: settings.lowRatingThreshold, limit: 10 });
  const recent = await listReviews(db, { limit: 8 });
  const counts = Object.fromEntries([5, 4, 3, 2, 1].map((stars) => [stars, Number(breakdown.find((row) => Number(row.stars) === stars)?.n || 0)]));
  return {
    totals: {
      total: totals.total, average: totals.average ? round1(totals.average) : null, pending: totals.pending, published: totals.published,
      private: totals.private, verified: totals.verified, thisMonth: totals.this_month, repeatReviewers: repeat.n,
      // Verified reviews ÷ paid visits by identified customers in the same period — only when a period is chosen.
      responseRate: visits && visits.n ? round1((totals.verified / visits.n) * 100) : null,
    },
    ratings: counts,
    services: services.map((row) => ({ name: row.name, count: row.n, average: round1(row.avg) })),
    // Staff: show an average only with enough reviews to mean something; never a ranking.
    staff: staff.map((row) => ({ name: row.name, count: row.n, average: row.n >= MIN_STAFF_SAMPLE ? round1(row.avg) : null })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    minStaffSample: MIN_STAFF_SAMPLE,
    trend: trend.map((row) => ({ month: row.month, count: row.n, average: round1(row.avg) })),
    lowRatings,
    recent,
    lowRatingThreshold: settings.lowRatingThreshold,
  };
}

/** Website: published + consented only; first name, rating, text, date, service. */
export async function publishedReviews(db, { limit = 12 } = {}) {
  const settings = await getCrmSettings(db);
  if (!settings.websiteReviewsEnabled) return [];
  const rows = await db.all(`SELECT r.display_name, r.overall_rating, r.review_text, (r.submitted_at AT TIME ZONE 'Asia/Kathmandu')::date::text AS date, s.name AS service
    FROM customer_reviews r LEFT JOIN salon_services s ON s.id = r.service_id
    WHERE r.status = 'PUBLISHED' AND r.public_consent ORDER BY r.moderated_at DESC NULLS LAST, r.submitted_at DESC LIMIT ?`, [Math.min(Number(limit) || 12, 50)]);
  return rows.map((row) => ({ name: row.display_name || 'Guest', rating: row.overall_rating ? Number(row.overall_rating) : null, text: row.review_text, date: row.date, service: row.service }));
}
