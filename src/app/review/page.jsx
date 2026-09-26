'use client';

/**
 * REVIEW & REWARDS — the page behind the one permanent salon QR.
 *
 * Mobile first, no login, no admin navigation. A phone number shows the customer's reward card;
 * nothing here ever earns a visit (visits come only from paid bills, or a one-time receipt code).
 * Leaving a review is optional and never affects rewards — any star rating is fine.
 */

import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ExternalLink, Gift, Loader2, Star, Ticket } from 'lucide-react';

const GOLD = '#d7b56d';

async function api(body) {
  const response = await fetch('/api/public/rewards', {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json.error || 'Something went wrong. Please try again.');
    error.code = json.code;
    throw error;
  }
  return json;
}

function Stars({ value, onChange, size = 'lg', label = 'Rating' }) {
  const cls = size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';
  return (
    <div className="flex justify-center gap-1.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)} className="rounded-full p-0.5 transition-transform active:scale-90">
          <Star className={cls} fill={n <= (value || 0) ? GOLD : 'transparent'} stroke={n <= (value || 0) ? GOLD : '#a8a29e'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function Dots({ progress, total }) {
  return (
    <div className="flex flex-wrap justify-center gap-2" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`h-5 w-5 rounded-full border-2 ${index < progress ? 'border-[#d7b56d] bg-[#d7b56d]' : 'border-stone-600 bg-transparent'}`} />
      ))}
    </div>
  );
}

function RewardCard({ program }) {
  const ready = program.available > 0;
  return (
    <div className="rounded-2xl border border-stone-700 bg-[#201c18] p-5 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400">{program.name}</p>
      {ready ? (
        <div className="mt-3">
          <Gift className="mx-auto h-10 w-10" style={{ color: GOLD }} aria-hidden="true" />
          <p className="mt-2 text-xl font-bold text-white">{program.rewardLabel.toUpperCase()} READY</p>
          <p className="mt-1 text-sm text-stone-300">Use it at your next visit — just tell us at the counter.</p>
          {program.available > 1 ? <p className="mt-1 text-xs text-stone-400">{program.available} rewards waiting</p> : null}
        </div>
      ) : null}
      <p className={`${ready ? 'mt-4' : 'mt-2'} text-4xl font-light tabular-nums text-white`}>{program.progress} <span className="text-stone-500">/ {program.requiredVisits}</span></p>
      <div className="mt-3"><Dots progress={program.progress} total={program.requiredVisits} /></div>
      <p className="mt-3 text-sm text-stone-300">
        {program.remaining > program.requiredVisits
          ? `${program.remaining} paid visits to your next reward.`
          : `${program.remaining} more paid visit${program.remaining === 1 ? '' : 's'} until your ${program.rewardLabel.replace(/^Free /i, 'FREE ')}.`}
      </p>
    </div>
  );
}

/**
 * "Review us on Google" — deliberately separate from the private feedback form and from rewards.
 * It is shown to EVERY visitor in the same place whatever rating they give (no review gating),
 * and nothing is earned for it. Loyalty comes only from paid visits.
 */
function GoogleReviewCard({ url }) {
  if (!url) return null;
  return (
    <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-5 text-center">
      <h2 className="text-lg font-semibold text-white">Review us on Google</h2>
      <p className="mt-1 text-sm text-stone-400">Optional. Your honest review helps other people in Surkhet find us.</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-stone-600 text-sm font-semibold text-white hover:border-[#d7b56d]">
        Open Google reviews <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="mt-2 text-[11px] text-stone-500">No reward is given for Google reviews, and your rewards never depend on it.</p>
    </section>
  );
}

export default function ReviewRewardsPage() {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState('start'); // start | card | review | thanks
  const [rating, setRating] = useState(0);
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visitRef, setVisitRef] = useState(null);
  const [answers, setAnswers] = useState({});
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');

  useEffect(() => { api().then(setConfig).catch((err) => setLoadError(err.message)); }, []);

  const lookup = async (event) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api({ action: 'lookup', phone });
      setCard(result);
      if (rating && result.visits?.length) { setVisitRef(result.visits[0].ref); setStep('review'); } else setStep('card');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const claim = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setClaimMessage('');
    try {
      const result = await api({ action: 'claim', phone, code, name });
      setCard(result);
      setCode('');
      setClaimOpen(false);
      setClaimMessage('Your visit has been added to your card.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const join = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setClaimMessage('');
    try {
      const result = await api({ action: 'join', phone, name });
      setCard(result.card);
      setClaimMessage('Welcome! You have joined our rewards. Every paid visit now counts toward your reward.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const submitReview = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api({
        action: 'review', rating: rating || null, text, publicConsent: consent, visitRef, formId: config?.form?.id, name,
        answers: Object.entries(answers).map(([id, value]) => ({ id, value })),
      });
      setStep('thanks');
      if (card?.found) setCard(await api({ action: 'lookup', phone }).catch(() => card));
    } catch (err) {
      setError(err.message);
      if (err.code === 'VISIT_EXPIRED') setStep(card ? 'card' : 'start');
    } finally { setBusy(false); }
  };

  const startReview = (ref = null) => { setVisitRef(ref); setError(''); setStep('review'); };
  const form = config?.form;

  return (
    <main className="min-h-dvh bg-[#171411] text-stone-100">
      <div className="mx-auto w-full max-w-md px-4 pb-12 pt-8">
        <header className="mb-6 text-center">
          <p className="font-serif text-2xl tracking-[0.18em] text-white">THE HAIR CUT</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Review &amp; Rewards</p>
        </header>

        {loadError ? <p className="rounded-xl bg-rose-950/60 p-4 text-center text-sm text-rose-200">{loadError}</p> : null}
        {!config && !loadError ? <p className="flex justify-center py-16 text-stone-400"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></p> : null}

        {config && step === 'start' ? (
          <div className="space-y-4">
            {config.reviewsEnabled && form ? (
              <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-5 text-center">
                <h1 className="text-xl font-semibold text-white">How was your visit?</h1>
                <div className="mt-4"><Stars value={rating} onChange={setRating} label="How was your visit?" /></div>
                <p className="mt-3 text-sm text-stone-400">Share your experience — every rating helps us improve.</p>
                {rating ? (
                  <button type="button" onClick={() => (config.rewardsEnabled ? document.getElementById('phone')?.focus() : startReview())} className="mt-4 w-full rounded-xl border border-stone-600 py-3 text-sm font-semibold text-white">
                    {config.rewardsEnabled ? 'Enter your number below to link your visit' : 'Write your review'}
                  </button>
                ) : null}
              </section>
            ) : null}

            {config.rewardsEnabled || config.reviewsEnabled ? (
              <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-5">
                <h2 className="text-center text-lg font-semibold text-white">{config.rewardsEnabled ? 'Your rewards' : 'Find your visit'}</h2>
                {config.programs?.length ? <p className="mt-1 text-center text-sm text-stone-400">{config.programs.map((p) => `${p.requiredVisits} paid ${p.name.replace(/ loyalty$/i, '')} → ${p.rewardLabel}`).join(' · ')}</p> : null}
                <form onSubmit={lookup} className="mt-4 space-y-3">
                  <label htmlFor="phone" className="block text-sm text-stone-300">Enter your mobile number</label>
                  <input id="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="98XXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^0-9+\s-]/g, ''))}
                    className="h-14 w-full rounded-xl border border-stone-600 bg-[#171411] px-4 text-center text-xl tracking-widest text-white placeholder:text-stone-600 focus:border-[#d7b56d] focus:outline-none" />
                  <button type="submit" disabled={busy || phone.replace(/\D/g, '').length < 10} className="h-14 w-full rounded-xl text-base font-bold text-[#171411] disabled:opacity-40" style={{ background: GOLD }}>
                    {busy ? 'Checking…' : 'Continue'}
                  </button>
                </form>
                {rating && config.generalFeedbackEnabled ? <button type="button" onClick={() => startReview()} className="mt-3 w-full text-center text-sm text-stone-400 underline">Continue without my number</button> : null}
                <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-500">We only use your number to find your reward card. It does not sign you up for messages.</p>
              </section>
            ) : null}
            {error ? <p role="alert" className="rounded-xl bg-rose-950/60 p-3 text-center text-sm text-rose-200">{error}</p> : null}
            <GoogleReviewCard url={config.googleReviewUrl} />
          </div>
        ) : null}

        {config && step === 'card' && card ? (
          <div className="space-y-4">
            <button type="button" onClick={() => { setStep('start'); setError(''); }} className="flex items-center gap-1 text-sm text-stone-400"><ChevronLeft className="h-4 w-4" />Back</button>
            <h1 className="text-2xl font-semibold text-white">{card.found && card.firstName ? `Hi, ${card.firstName}` : 'Welcome'}</h1>
            {claimMessage ? <p className="flex items-center gap-2 rounded-xl bg-emerald-950/60 p-3 text-sm text-emerald-200"><Check className="h-4 w-4" />{claimMessage}</p> : null}
            {config.rewardsEnabled ? (
              card.programs?.length ? card.programs.map((program) => <RewardCard key={program.programId} program={program} />)
                : <p className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-5 text-center text-sm text-stone-300">{card.found ? 'No reward visits yet. Your paid visits will show here.' : config.joinEnabled ? 'This number is not in our rewards yet — join below in a few seconds.' : 'We could not find a reward card for this number yet. It starts with your first paid visit.'}</p>
            ) : null}

            {config.joinEnabled && !card.found ? (
              <section className="rounded-2xl border border-[#d7b56d]/40 bg-[#1f1b17] p-5">
                <h2 className="text-center text-lg font-semibold text-white">Join our rewards</h2>
                <p className="mt-1 text-center text-sm text-stone-400">Free to join. Your paid visits start counting from your next bill.</p>
                <form onSubmit={join} className="mt-4 space-y-3">
                  <input aria-label="Your name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name"
                    className="h-12 w-full rounded-xl border border-stone-600 bg-[#171411] px-4 text-white placeholder:text-stone-600 focus:border-[#d7b56d] focus:outline-none" />
                  <p className="text-center text-xs text-stone-500">Mobile number: {phone}</p>
                  <button type="submit" disabled={busy || name.trim().length < 2} className="h-12 w-full rounded-xl text-sm font-bold text-[#171411] disabled:opacity-40" style={{ background: GOLD }}>{busy ? 'Joining…' : 'Join rewards'}</button>
                </form>
                <p className="mt-3 text-center text-[11px] text-stone-500">Tell us this number when you pay so your visit is added to your card.</p>
              </section>
            ) : null}

            {config.claimCodesEnabled ? (
              <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-4">
                {!claimOpen ? (
                  <button type="button" onClick={() => setClaimOpen(true)} className="flex w-full items-center justify-center gap-2 text-sm font-semibold" style={{ color: GOLD }}><Ticket className="h-4 w-4" />Have a code on your receipt?</button>
                ) : (
                  <form onSubmit={claim} className="space-y-3">
                    <label htmlFor="code" className="block text-sm text-stone-300">Reward code from your receipt</label>
                    <input id="code" autoCapitalize="characters" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="H7K9P2"
                      className="h-12 w-full rounded-xl border border-stone-600 bg-[#171411] px-4 text-center text-lg tracking-[0.4em] text-white placeholder:text-stone-600 focus:border-[#d7b56d] focus:outline-none" />
                    {!card.found ? <input aria-label="Your first name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your first name" className="h-12 w-full rounded-xl border border-stone-600 bg-[#171411] px-4 text-white placeholder:text-stone-600" /> : null}
                    <button type="submit" disabled={busy || code.length !== 6} className="h-12 w-full rounded-xl text-sm font-bold text-[#171411] disabled:opacity-40" style={{ background: GOLD }}>{busy ? 'Adding…' : 'Add this visit'}</button>
                  </form>
                )}
              </section>
            ) : null}

            {config.reviewsEnabled && form ? (
              <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-4">
                <h2 className="font-semibold text-white">Leave a review</h2>
                {card.visits?.length ? (
                  <ul className="mt-3 space-y-2">
                    {card.visits.map((visit) => (
                      <li key={visit.ref}><button type="button" onClick={() => startReview(visit.ref)} className="flex w-full items-center justify-between rounded-xl border border-stone-700 px-4 py-3 text-left text-sm hover:border-[#d7b56d]">
                        <span><span className="block text-white">{visit.services}</span><span className="text-xs text-stone-400">{new Date(`${visit.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}</span></span>
                        <span className="text-xs font-semibold" style={{ color: GOLD }}>Review</span>
                      </button></li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-stone-400">No recent visits waiting for a review.</p>}
                {config.generalFeedbackEnabled ? <button type="button" onClick={() => startReview()} className="mt-3 text-sm text-stone-400 underline">Share general feedback</button> : null}
              </section>
            ) : null}

            {card.activity?.length && config.rewardsEnabled ? (
              <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-4">
                <h2 className="font-semibold text-white">Recent rewards activity</h2>
                <ul className="mt-2 divide-y divide-stone-800 text-sm">
                  {card.activity.map((entry, index) => (
                    <li key={index} className="flex items-center justify-between py-2">
                      <span><span className="text-stone-300">{entry.item || entry.program}</span><span className="block text-xs text-stone-500">{new Date(`${entry.date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })} · {entry.label}</span></span>
                      <span className={`tabular-nums ${entry.visits > 0 ? 'text-emerald-300' : 'text-stone-400'}`}>{entry.visits > 0 ? `+${entry.visits}` : entry.visits} visit{Math.abs(entry.visits) === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {error ? <p role="alert" className="rounded-xl bg-rose-950/60 p-3 text-center text-sm text-rose-200">{error}</p> : null}
            <GoogleReviewCard url={config.googleReviewUrl} />
          </div>
        ) : null}

        {config && step === 'review' && form ? (
          <form onSubmit={submitReview} className="space-y-4">
            <button type="button" onClick={() => setStep(card ? 'card' : 'start')} className="flex items-center gap-1 text-sm text-stone-400"><ChevronLeft className="h-4 w-4" />Back</button>
            <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-5 text-center">
              <h1 className="text-xl font-semibold text-white">How was your visit?</h1>
              {visitRef && card?.visits ? <p className="mt-1 text-sm text-stone-400">{card.visits.find((v) => v.ref === visitRef)?.services}</p> : null}
              {form.ratingEnabled ? <div className="mt-4"><Stars value={rating} onChange={setRating} /></div> : null}
            </section>
            {form.questions?.map((question) => (
              <section key={question.id} className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-4">
                <p className="text-sm font-medium text-white">{question.label}{question.required ? ' *' : ''}</p>
                <div className="mt-2">
                  {question.type === 'STAR' ? <Stars size="sm" label={question.label} value={answers[question.id]} onChange={(value) => setAnswers({ ...answers, [question.id]: value })} /> : null}
                  {question.type === 'TEXT' ? <textarea rows={2} value={answers[question.id] || ''} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} className="w-full rounded-xl border border-stone-600 bg-[#171411] p-3 text-white" aria-label={question.label} /> : null}
                  {question.type === 'YES_NO' ? (
                    <div className="flex gap-2">{['yes', 'no'].map((value) => <button key={value} type="button" aria-pressed={answers[question.id] === value} onClick={() => setAnswers({ ...answers, [question.id]: value })} className={`h-11 flex-1 rounded-xl border text-sm font-semibold capitalize ${answers[question.id] === value ? 'border-[#d7b56d] text-white' : 'border-stone-600 text-stone-400'}`}>{value}</button>)}</div>
                  ) : null}
                  {question.type === 'SINGLE' || question.type === 'MULTI' ? (
                    <div className="flex flex-wrap gap-2">
                      {question.options.map((option) => {
                        const current = answers[question.id];
                        const selected = question.type === 'MULTI' ? (current || []).includes(option) : current === option;
                        const toggle = () => setAnswers({ ...answers, [question.id]: question.type === 'MULTI' ? (selected ? current.filter((o) => o !== option) : [...(current || []), option]) : option });
                        return <button key={option} type="button" aria-pressed={selected} onClick={toggle} className={`min-h-10 rounded-full border px-4 text-sm ${selected ? 'border-[#d7b56d] text-white' : 'border-stone-600 text-stone-400'}`}>{option}</button>;
                      })}
                    </div>
                  ) : null}
                </div>
              </section>
            ))}
            {form.reviewTextEnabled ? (
              <section className="rounded-2xl border border-stone-800 bg-[#1f1b17] p-4">
                <label htmlFor="review-text" className="text-sm font-medium text-white">Share your experience</label>
                <textarea id="review-text" rows={4} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} placeholder="What did you like? What could be better?" className="mt-2 w-full rounded-xl border border-stone-600 bg-[#171411] p-3 text-white placeholder:text-stone-600" />
              </section>
            ) : null}
            {!card?.found && !visitRef ? <input aria-label="Your first name (optional)" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your first name (optional)" className="h-12 w-full rounded-xl border border-stone-600 bg-[#171411] px-4 text-white placeholder:text-stone-600" /> : null}
            {form.publicConsentEnabled ? (
              <label className="flex items-start gap-3 text-sm text-stone-300"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 accent-[#d7b56d]" />You may show my first name and this review on the salon website.</label>
            ) : null}
            <p className="text-[11px] text-stone-500">Your rewards never depend on your rating.</p>
            {error ? <p role="alert" className="rounded-xl bg-rose-950/60 p-3 text-center text-sm text-rose-200">{error}</p> : null}
            <button type="submit" disabled={busy || (form.ratingEnabled && !rating)} className="h-14 w-full rounded-xl text-base font-bold text-[#171411] disabled:opacity-40" style={{ background: GOLD }}>{busy ? 'Sending…' : 'Submit review'}</button>
          </form>
        ) : null}

        {config && step === 'thanks' ? (
          <div className="space-y-4 text-center">
            <Check className="mx-auto h-12 w-12 rounded-full bg-emerald-900/60 p-2 text-emerald-300" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-white">Thank you for your feedback.</h1>
            <p className="text-sm text-stone-400">It goes straight to the salon team.</p>
            {config.rewardsEnabled && card?.programs?.length ? card.programs.map((program) => <RewardCard key={program.programId} program={program} />) : null}
            <GoogleReviewCard url={config.googleReviewUrl} />
            {card ? <button type="button" onClick={() => { setStep('card'); setRating(0); setText(''); setAnswers({}); setConsent(false); }} className="text-sm text-stone-400 underline">Back to my card</button> : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
