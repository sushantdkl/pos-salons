'use client';

/**
 * CUSTOMER REVIEWS — build feedback forms, print the QR, moderate responses, publish selected
 * reviews. Moderation only controls PUBLIC display: feedback (including low ratings) is kept.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Download, MessageSquareHeart, Printer, RotateCcw, Star } from 'lucide-react';
import {
  AlertBanner, ErpButton, ErpPage, ErrorState, FinancialTable, LoadingState, MetricCard, MetricGroup, PageHeader, StatusBadge,
} from '@/components/erp';
import { erpFetch, useReport } from '@/components/erp/use-report';
import { FIELD, LABEL, Modal } from '@/components/hrm/ui';

const TABS = [['overview', 'Overview'], ['responses', 'Responses'], ['published', 'Published'], ['forms', 'Feedback Forms'], ['qr', 'QR Codes'], ['settings', 'Settings']];
const TONE = { PENDING: 'cash', PUBLISHED: 'inflow', PRIVATE: 'online', REJECTED: 'outflow', ARCHIVED: 'neutral' };

function StarsText({ value }) {
  if (!value) return <span className="text-stone-400">—</span>;
  return <span className="whitespace-nowrap text-amber-500" aria-label={`${value} stars`}>{'★'.repeat(value)}<span className="text-stone-300">{'★'.repeat(5 - value)}</span></span>;
}

function ReviewDetail({ review, onClose, onChanged }) {
  const [note, setNote] = useState(review.moderationNote || '');
  const [error, setError] = useState('');
  const act = async (body) => {
    setError('');
    try { await erpFetch('/api/crm/reviews', { method: 'POST', body: { id: review.id, note, ...body } }); onChanged(); } catch (err) { setError(err.message); }
  };
  return (
    <Modal wide title={`${review.customerName || review.displayName || 'Guest'} · ${review.rating ? `${review.rating}★` : 'no rating'}`}
      subtitle={`${new Date(review.submittedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu' })}${review.formName ? ` · ${review.formName}` : ''}`} onClose={onClose}
      footer={(
        <>
          <ErpButton onClick={() => act({ action: 'moderate', status: 'PUBLISHED' })} disabled={!review.publicConsent}>Publish</ErpButton>
          <ErpButton onClick={() => act({ action: 'moderate', status: 'PRIVATE' })}>Keep private</ErpButton>
          <ErpButton onClick={() => act({ action: 'moderate', status: 'ARCHIVED' })}>Archive</ErpButton>
          <ErpButton variant="danger" onClick={() => act({ action: 'moderate', status: 'REJECTED' })}>Reject</ErpButton>
        </>
      )}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={review.status} label={review.status.charAt(0) + review.status.slice(1).toLowerCase()} tone={TONE[review.status]} />
        {review.verified ? <StatusBadge status="VERIFIED" label="Verified visit" tone="inflow" /> : <StatusBadge status="GENERAL" label="General feedback" tone="neutral" />}
        {review.publicConsent ? <span className="text-xs text-emerald-700">Customer agreed to public display</span> : <span className="text-xs text-stone-500">No public consent — can only stay private</span>}
      </div>
      <div className="text-2xl"><StarsText value={review.rating} /></div>
      {review.text ? <p className="whitespace-pre-line rounded-lg bg-stone-50 p-3 text-sm text-stone-800">{review.text}</p> : null}
      {review.answers?.length ? (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {review.answers.map((answer) => (<div key={answer.id}><dt className="text-xs text-stone-500">{answer.label}</dt><dd className="text-stone-800">{answer.type === 'STAR' ? <StarsText value={answer.value} /> : Array.isArray(answer.value) ? answer.value.join(', ') : String(answer.value)}</dd></div>))}
        </dl>
      ) : null}
      <p className="text-xs text-stone-500">
        {[review.customerName && `Customer: ${review.customerName}${review.customerPhone ? ` (${review.customerPhone})` : ''}`, review.serviceName && `Service: ${review.serviceName}`, review.staffName && `Staff: ${review.staffName}`, review.billNumber && `Bill ${review.billNumber}`].filter(Boolean).join(' · ')}
      </p>
      {review.customerId ? <Link href={`/admin/customers/${review.customerId}`} className="text-xs font-semibold text-pink-700 hover:underline">Open customer profile</Link> : null}
      <label className={LABEL}>Internal note (required to reject or archive)<input className={FIELD} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {review.verified && !review.superseded ? (
        <button type="button" onClick={() => { if (note.trim()) act({ action: 'reopen', reason: note }); else setError('Write the reason in the note first.'); }} className="inline-flex items-center gap-1 text-xs font-semibold text-stone-600 hover:underline">
          <RotateCcw className="h-3.5 w-3.5" />Let the customer review this visit again
        </button>
      ) : null}
      {review.moderatedBy ? <p className="text-xs text-stone-400">Last moderated by {review.moderatedBy}{review.moderationNote ? `: ${review.moderationNote}` : ''}</p> : null}
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
    </Modal>
  );
}

function ReviewsTable({ reviews, onOpen }) {
  return (
    <FinancialTable caption="Reviews" rows={reviews} empty="No responses here yet." onRowClick={onOpen} columns={[
      { key: 'when', label: 'Submitted', render: (row) => new Date(row.submittedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short' }) },
      { key: 'who', label: 'Customer', render: (row) => <span className="font-semibold text-stone-900">{row.customerName || row.displayName || 'Guest'}</span> },
      { key: 'rating', label: 'Rating', render: (row) => <StarsText value={row.rating} /> },
      { key: 'text', label: 'Review', render: (row) => <span className="line-clamp-2 max-w-md text-stone-700">{row.text || '—'}</span> },
      { key: 'service', label: 'Service', render: (row) => row.serviceName || '—' },
      { key: 'verified', label: '', render: (row) => (row.verified ? <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="Verified visit" /> : null) },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} label={row.status.charAt(0) + row.status.slice(1).toLowerCase()} tone={TONE[row.status]} /> },
    ]} />
  );
}

function QrPanel({ settings }) {
  const [format, setFormat] = useState('a4');
  const print = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const sizes = { a4: { qr: '120mm', head: '40px', page: 'A4' }, card: { qr: '60mm', head: '22px', page: 'A6' }, sticker: { qr: '32mm', head: '12px', page: '50mm 70mm' } }[format];
    const esc = (value) => String(value || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    win.document.write(`<!doctype html><html><head><title>Review &amp; Rewards QR</title><style>
      @page { size: ${sizes.page}; margin: 8mm; } body { font-family: Georgia, serif; text-align: center; color: #171411; margin: 0; }
      h1 { font-size: ${sizes.head}; letter-spacing: .08em; margin: 0 0 .3em; } p { font-family: Arial, sans-serif; margin: .3em 0; }
      img { width: ${sizes.qr}; height: ${sizes.qr}; margin: .6em auto; display: block; } .brand { font-size: .8em; letter-spacing: .3em; margin-top: .6em; }
      .foot { font-weight: bold; } .url { font-size: .7em; color: #57534e; }
    </style></head><body>
      <p class="brand">THE HAIR CUT</p><h1>${esc(settings.qrHeadline)}</h1><p>${esc(settings.qrSubtext)}</p>
      <img src="${window.location.origin}/api/public/qr" alt="QR code" onload="setTimeout(function(){window.print()},200)" />
      ${settings.qrFooter ? `<p class="foot">${esc(settings.qrFooter)}</p>` : ''}<p class="url">${window.location.host}/review</p>
    </body></html>`);
    win.document.close();
  };
  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/public/qr" alt="Universal Review & Rewards QR code" className="mx-auto h-48 w-48" />
        <p className="mt-2 text-xs text-stone-500">Always opens <b>/review</b>. It holds no customer data and never gives a stamp by itself.</p>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Print copy (edit in Settings)</p>
          <p className="mt-2 font-serif text-xl font-bold">{settings.qrHeadline}</p>
          <p className="text-sm text-stone-600">{settings.qrSubtext}</p>
          {settings.qrFooter ? <p className="mt-1 text-sm font-semibold">{settings.qrFooter}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm" value={format} onChange={(event) => setFormat(event.target.value)} aria-label="Print size">
            <option value="a4">A4 poster</option>
            <option value="card">Counter card (A6)</option>
            <option value="sticker">Small sticker</option>
          </select>
          <ErpButton icon={Printer} variant="primary" onClick={print}>Print</ErpButton>
          <a href="/api/public/qr?format=png&size=1200" download="review-rewards-qr.png" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Download className="h-4 w-4" />PNG</a>
          <a href="/api/public/qr" download="review-rewards-qr.svg" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"><Download className="h-4 w-4" />SVG</a>
          <a href="/review" target="_blank" rel="noreferrer" className="text-sm font-semibold text-pink-700 hover:underline">Open the customer page</a>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ settings, onSaved }) {
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setMessage(''); };
  const save = async () => {
    setError('');
    try { await erpFetch('/api/crm/reviews', { method: 'POST', body: { action: 'settings', ...form, claimCodeValidDays: Number(form.claimCodeValidDays), reviewWindowDays: Number(form.reviewWindowDays), lowRatingThreshold: Number(form.lowRatingThreshold) } }); setMessage('Saved.'); onSaved(); } catch (err) { setError(err.message); }
  };
  const toggle = (key, label, hint) => (
    <label className="flex items-start gap-3 py-1.5"><input type="checkbox" className="mt-1 h-4 w-4 accent-pink-600" checked={Boolean(form[key])} onChange={(event) => set(key, event.target.checked)} />
      <span><span className="block text-sm font-semibold text-stone-900">{label}</span>{hint ? <span className="block text-xs text-stone-500">{hint}</span> : null}</span></label>
  );
  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-stone-200 bg-white p-4">
      {toggle('publicReviewsEnabled', 'Customers can leave reviews from the QR page')}
      {toggle('generalFeedbackEnabled', 'Allow feedback without a verified visit', 'Shown as “General feedback”, separate from verified visit reviews.')}
      {toggle('publicRewardsEnabled', 'Customers can see their reward card with their phone number', 'Shows first name and progress only. Rate-limited.')}
      {toggle('claimCodesEnabled', 'Print a one-time reward code on walk-in receipts')}
      {toggle('receiptQrEnabled', 'Print the Review & Rewards QR on receipts')}
      {toggle('websiteReviewsEnabled', 'Show published reviews on the website')}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={LABEL}>Review window (days)<input type="number" min="1" max="90" className={FIELD} value={form.reviewWindowDays} onChange={(event) => set('reviewWindowDays', event.target.value)} /></label>
        <label className={LABEL}>Code valid (days)<input type="number" min="1" max="60" className={FIELD} value={form.claimCodeValidDays} onChange={(event) => set('claimCodeValidDays', event.target.value)} /></label>
        <label className={LABEL}>Low-rating alert at ≤<select className={FIELD} value={form.lowRatingThreshold} onChange={(event) => set('lowRatingThreshold', event.target.value)}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}★</option>)}</select></label>
      </div>
      <label className={LABEL}>QR headline<input className={FIELD} value={form.qrHeadline} onChange={(event) => set('qrHeadline', event.target.value)} /></label>
      <label className={LABEL}>QR line<input className={FIELD} value={form.qrSubtext} onChange={(event) => set('qrSubtext', event.target.value)} /></label>
      <label className={LABEL}>QR footer<input className={FIELD} value={form.qrFooter} onChange={(event) => set('qrFooter', event.target.value)} /></label>
      <p className="text-xs text-stone-500">Using the QR, reviewing or checking rewards never signs anyone up for marketing messages.</p>
      {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
      {message ? <AlertBanner tone="inflow">{message}</AlertBanner> : null}
      <ErpButton variant="primary" onClick={save}>Save settings</ErpButton>
    </div>
  );
}

export default function CustomerReviewsPage() {
  const [tab, setTab] = useState('overview');
  const [status, setStatus] = useState('PENDING');
  const [open, setOpen] = useState(null);
  const overview = useReport('/api/crm/reviews');
  const responses = useReport(`/api/crm/reviews?view=responses${status !== 'ALL' ? `&status=${status}` : ''}`, { enabled: tab === 'responses' });
  const published = useReport('/api/crm/reviews?view=responses&status=PUBLISHED', { enabled: tab === 'published' });
  const settings = useReport('/api/crm/reviews?view=settings', { enabled: tab === 'qr' || tab === 'settings' });
  useEffect(() => { const wanted = new URLSearchParams(window.location.search).get('tab'); if (wanted) setTab(wanted); }, []);
  const refresh = () => { setOpen(null); overview.reload(); responses.reload(); published.reload(); };
  const o = overview.data;

  return (
    <ErpPage>
      <PageHeader icon={MessageSquareHeart} iconTone="crm" title="Customer Reviews" subtitle="Build feedback forms, print QR codes, moderate responses, and publish selected customer reviews." />
      <div className="space-y-4">
        <nav className="flex gap-2 overflow-x-auto border-b border-stone-200 pb-2" aria-label="Review sections">
          {TABS.map(([key, label]) => (key === 'forms'
            ? <Link key={key} href="/admin/crm/reviews/forms" className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100">{label}</Link>
            : <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? 'bg-pink-100 text-pink-900' : 'text-stone-600 hover:bg-stone-100'}`}>{label}</button>))}
        </nav>

        {tab === 'overview' ? (
          <>
            {overview.error ? <ErrorState message={overview.error} onRetry={overview.reload} /> : null}
            {!o && !overview.error ? <LoadingState /> : null}
            {o ? (
              <>
                <MetricGroup columns={4}>
                  <MetricCard label="Total responses" value={o.totals.total} tone="crm" />
                  <MetricCard label="Average rating" value={o.totals.average === null ? '—' : `${o.totals.average} ★`} tone="cash" />
                  <MetricCard label="Pending review" value={o.totals.pending} tone="cash" />
                  <MetricCard label="Published" value={o.totals.published} tone="inflow" />
                  <MetricCard label="Private" value={o.totals.private} tone="online" />
                  <MetricCard label="This month" value={o.totals.thisMonth} tone="neutral" />
                  <MetricCard label="Verified visits" value={o.totals.verified} tone="inflow" />
                  <MetricCard label="Repeat reviewers" value={o.totals.repeatReviewers} tone="neutral" />
                </MetricGroup>
                {o.lowRatings.length ? (
                  <div className="space-y-2">
                    {o.lowRatings.map((review) => (
                      <AlertBanner key={review.id} tone="outflow" title={`New ${review.rating}★ review`} action={<ErpButton className="min-h-8 px-2 text-xs" onClick={() => setOpen(review)}>View feedback</ErpButton>}>
                        {[review.customerName || review.displayName, review.serviceName, review.staffName].filter(Boolean).join(' · ')}{review.text ? ` — “${review.text.slice(0, 120)}”` : ''}
                      </AlertBanner>
                    ))}
                    <p className="text-xs text-stone-500">Use feedback to coach and improve — one review is not a verdict on anyone.</p>
                  </div>
                ) : null}
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <p className="text-sm font-semibold text-stone-900">Ratings</p>
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const total = Object.values(o.ratings).reduce((a, b) => a + b, 0) || 1;
                      return (
                        <div key={stars} className="mt-2 flex items-center gap-2 text-sm">
                          <span className="w-8 text-stone-600">{stars}<Star className="ml-0.5 inline h-3 w-3 fill-amber-400 text-amber-400" /></span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full bg-amber-400" style={{ width: `${(o.ratings[stars] / total) * 100}%` }} /></span>
                          <span className="w-8 text-right tabular-nums text-stone-600">{o.ratings[stars]}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <p className="text-sm font-semibold text-stone-900">Most reviewed services</p>
                    {o.services.length ? o.services.map((row) => <p key={row.name} className="mt-2 flex justify-between text-sm"><span>{row.name}</span><span className="text-stone-500">{row.count} · {row.average}★</span></p>) : <p className="mt-2 text-sm text-stone-400">No service reviews yet.</p>}
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <p className="text-sm font-semibold text-stone-900">Staff feedback</p>
                    {o.staff.length ? o.staff.map((row) => <p key={row.name} className="mt-2 flex justify-between text-sm"><span>{row.name}</span><span className="text-stone-500">{row.count} review{row.count === 1 ? '' : 's'}{row.average !== null ? ` · ${row.average}★` : ''}</span></p>) : <p className="mt-2 text-sm text-stone-400">No staff feedback yet.</p>}
                    <p className="mt-2 text-[11px] text-stone-400">Averages shown only from {o.minStaffSample} reviews up. Not a ranking.</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="mb-2 text-sm font-semibold text-stone-900">Recent feedback</p>
                  <ReviewsTable reviews={o.recent} onOpen={setOpen} />
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {tab === 'responses' ? (
          <>
            <div className="flex flex-wrap gap-1">
              {['PENDING', 'PRIVATE', 'PUBLISHED', 'REJECTED', 'ARCHIVED', 'ALL'].map((key) => <button key={key} type="button" onClick={() => setStatus(key)} aria-pressed={status === key} className={`rounded-full border px-3 py-1 text-xs font-semibold ${status === key ? 'border-pink-300 bg-pink-100 text-pink-900' : 'border-stone-200 bg-white text-stone-600'}`}>{key === 'ALL' ? 'All' : key.charAt(0) + key.slice(1).toLowerCase()}</button>)}
            </div>
            {responses.error ? <ErrorState message={responses.error} onRetry={responses.reload} /> : null}
            {responses.data ? <ReviewsTable reviews={responses.data.reviews} onOpen={setOpen} /> : <LoadingState />}
          </>
        ) : null}

        {tab === 'published' ? (
          <>
            <p className="flex items-center gap-2 text-sm text-stone-600"><AlertTriangle className="h-4 w-4 text-amber-600" />The website shows first name, rating, review, date and service only.</p>
            {published.data ? <ReviewsTable reviews={published.data.reviews} onOpen={setOpen} /> : <LoadingState />}
          </>
        ) : null}

        {tab === 'qr' ? (settings.data ? <QrPanel settings={settings.data.settings} /> : <LoadingState />) : null}
        {tab === 'settings' ? (settings.data ? <SettingsPanel settings={settings.data.settings} onSaved={settings.reload} /> : <LoadingState />) : null}
      </div>
      {open ? <ReviewDetail review={open} onClose={() => setOpen(null)} onChanged={refresh} /> : null}
    </ErpPage>
  );
}
