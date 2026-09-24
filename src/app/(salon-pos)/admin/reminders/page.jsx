'use client';

/**
 * REMINDERS — WhatsApp messages to saved customers, one by one or to everyone selected.
 *
 * There is no paid WhatsApp API: each message opens WhatsApp (wa.me) with the text filled in
 * and staff press Send. Browsers block many pop-ups from one click, so "Send to selected" runs
 * a queue: the first chat opens at once, then one tap on "Open next" opens each following chat.
 * "Copy numbers" gives the whole list for a WhatsApp Broadcast List (one send to everyone).
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, ClipboardCopy, MessageCircle, Search, Send, SkipForward, Square, SquareCheckBig, X } from 'lucide-react';
import { AlertBanner, ErpButton, ErpPage, ErrorState, LoadingState, money, PageHeader } from '@/components/erp';
import { erpFetch } from '@/components/erp/use-report';
import { activeServiceStaffFilter } from '@/lib/staff/service-staff';
import { buildWhatsAppUrl, formatWhatsAppNumber, SALON_NAME, toWhatsAppNumber, whatsAppBlockReason } from '@/lib/messaging/whatsapp';
import { CREDIT_REMINDER_TEMPLATE, DEFAULT_REMINDER_TEMPLATE, fillMessageTemplate } from '@/lib/messaging/template';

const TEMPLATE_KEY = 'reminders.template';
const FIELD = 'h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200';

function readTemplate() {
  try { return localStorage.getItem(TEMPLATE_KEY) || DEFAULT_REMINDER_TEMPLATE; } catch { return DEFAULT_REMINDER_TEMPLATE; }
}
function saveTemplate(value) {
  try { localStorage.setItem(TEMPLATE_KEY, value); } catch { /* per-device convenience only */ }
}

export default function RemindersPage() {
  const [customers, setCustomers] = useState(null);
  const [balances, setBalances] = useState(new Map());
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [template, setTemplate] = useState(DEFAULT_REMINDER_TEMPLATE);
  const [search, setSearch] = useState('');
  const [audience, setAudience] = useState('all');
  const [serviceName, setServiceName] = useState('');
  const [staffName, setStaffName] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [sent, setSent] = useState(() => new Set());
  const [queue, setQueue] = useState(null); // { ids: [], index }
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setTemplate(readTemplate()); }, []);

  const load = async () => {
    setLoadError('');
    try {
      const [customerData, ledgerData, serviceData, staffData] = await Promise.all([
        erpFetch('/api/admin/customers'),
        erpFetch('/api/customers/ledger').catch(() => ({ customers: [] })),
        erpFetch('/api/admin/services').catch(() => ({ services: [] })),
        erpFetch('/api/admin/employees').catch(() => ({ employees: [] })),
      ]);
      setCustomers(customerData.customers || []);
      setBalances(new Map((ledgerData.customers || []).map((row) => [row.id, row.balance])));
      setServices(serviceData.services || []);
      setStaff((staffData.employees || []).filter(activeServiceStaffFilter));
    } catch (err) { setLoadError(err.message); }
  };
  useEffect(() => { load(); }, []);

  const categories = useMemo(() => [...new Set((customers || []).map((row) => row.customer_category).filter(Boolean))].sort(), [customers]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (customers || []).filter((row) => {
      if (term && !(row.name?.toLowerCase().includes(term) || String(row.phone || '').includes(term))) return false;
      if (audience === 'credit') return (balances.get(row.id) || 0) > 0;
      if (audience === 'repeat') return Number(row.total_visits || 0) >= 2;
      if (audience.startsWith('cat:')) return row.customer_category === audience.slice(4);
      return true;
    });
  }, [customers, balances, search, audience]);

  const messageFor = (row) => fillMessageTemplate(template, {
    name: row.name, salon: SALON_NAME, amount: balances.get(row.id) || 0, service: serviceName, staff: staffName,
  });
  const canMessage = (row) => !whatsAppBlockReason(row.phone);
  const byId = useMemo(() => new Map((customers || []).map((row) => [row.id, row])), [customers]);

  const open = (row) => {
    const url = buildWhatsAppUrl(row.phone, messageFor(row));
    if (!url) { setError(`${row.name}: ${whatsAppBlockReason(row.phone)}.`); return false; }
    window.open(url, '_blank', 'noopener,noreferrer');
    setSent((current) => new Set(current).add(row.id));
    return true;
  };

  const sendOne = (row) => { setError(''); open(row); };

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const shownMessageable = shown.filter(canMessage);
  const allShownSelected = shownMessageable.length > 0 && shownMessageable.every((row) => selected.has(row.id));
  const selectAllShown = () => setSelected((current) => {
    const next = new Set(current);
    if (allShownSelected) shownMessageable.forEach((row) => next.delete(row.id));
    else shownMessageable.forEach((row) => next.add(row.id));
    return next;
  });

  const selectedMessageable = [...selected].map((id) => byId.get(id)).filter((row) => row && canMessage(row));

  const startQueue = () => {
    setError('');
    setNotice('');
    const ids = selectedMessageable.map((row) => row.id);
    if (!ids.length) return;
    open(byId.get(ids[0]));
    setQueue({ ids, index: 0 });
  };
  // Each tap opens exactly one chat (a direct user gesture, so the browser allows it).
  const next = () => {
    if (!queue) return;
    const index = queue.index + 1;
    if (index >= queue.ids.length) {
      setNotice(`Finished — ${queue.ids.length} chat${queue.ids.length === 1 ? '' : 's'} opened. Make sure you pressed Send in each WhatsApp chat.`);
      setQueue(null);
      setSelected(new Set());
      return;
    }
    open(byId.get(queue.ids[index]));
    setQueue({ ...queue, index });
  };
  // Drop the upcoming customer from this run without opening their chat.
  const skip = () => {
    if (!queue) return;
    setQueue({ ...queue, ids: queue.ids.filter((_, i) => i !== queue.index + 1) });
  };

  const copyNumbers = async () => {
    const numbers = selectedMessageable.map((row) => `+${toWhatsAppNumber(row.phone)}`).join('\n');
    try {
      await navigator.clipboard.writeText(numbers);
      setNotice(`${selectedMessageable.length} numbers copied. Paste them into a WhatsApp Broadcast List to send one message to everyone.`);
    } catch { setError('Could not copy — your browser blocked clipboard access.'); }
  };

  const onAudience = (value) => {
    setAudience(value);
    setSelected(new Set());
    if (value === 'credit' && template === DEFAULT_REMINDER_TEMPLATE) setTemplate(CREDIT_REMINDER_TEMPLATE);
    if (value !== 'credit' && template === CREDIT_REMINDER_TEMPLATE) setTemplate(DEFAULT_REMINDER_TEMPLATE);
  };

  const current = queue ? byId.get(queue.ids[queue.index]) : null;
  const upcoming = queue && queue.index + 1 < queue.ids.length ? byId.get(queue.ids[queue.index + 1]) : null;
  const preview = shown[0] ? messageFor(shown[0]) : fillMessageTemplate(template, { name: 'Customer', salon: SALON_NAME, amount: 0 });

  return (
    <ErpPage>
      <PageHeader
        icon={MessageCircle}
        iconTone="inflow"
        title="Reminders"
        subtitle="Send WhatsApp reminders to customers — one by one, or to everyone selected."
      />
      {loadError ? <ErrorState message={loadError} onRetry={load} /> : null}
      {!customers && !loadError ? <LoadingState /> : null}
      {customers ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <label className="block text-xs font-bold uppercase tracking-[0.04em] text-stone-500" htmlFor="reminder-template">Message</label>
            <textarea
              id="reminder-template"
              rows={3}
              value={template}
              onChange={(event) => { setTemplate(event.target.value); saveTemplate(event.target.value); }}
              className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-stone-500">Use <code>{'{name}'}</code>, <code>{'{salon}'}</code>, <code>{'{amount}'}</code> (credit due), <code>{'{service}'}</code>, <code>{'{staff}'}</code>. Saved on this device.</p>
              <div className="flex gap-2">
                <button type="button" className="text-xs font-semibold text-indigo-700 hover:underline" onClick={() => { setTemplate(DEFAULT_REMINDER_TEMPLATE); saveTemplate(DEFAULT_REMINDER_TEMPLATE); }}>General reminder</button>
                <button type="button" className="text-xs font-semibold text-indigo-700 hover:underline" onClick={() => { setTemplate(CREDIT_REMINDER_TEMPLATE); saveTemplate(CREDIT_REMINDER_TEMPLATE); }}>Credit due reminder</button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <select value={serviceName} onChange={(event) => setServiceName(event.target.value)} className={FIELD} aria-label="Service for {service}">
                <option value="">{'{service}'} — none</option>
                {services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
              </select>
              <select value={staffName} onChange={(event) => setStaffName(event.target.value)} className={FIELD} aria-label="Stylist for {staff}">
                <option value="">{'{staff}'} — none</option>
                {staff.map((member) => <option key={member.id} value={member.full_name}>{member.full_name}</option>)}
              </select>
            </div>
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><span className="font-semibold">Preview:</span> {preview}</p>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-3 h-4 w-4 text-stone-400" aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or phone…" aria-label="Search customers" className={`${FIELD} w-full pl-8`} />
            </label>
            <select value={audience} onChange={(event) => onAudience(event.target.value)} className={FIELD} aria-label="Which customers">
              <option value="all">All customers</option>
              <option value="credit">Credit due</option>
              <option value="repeat">Repeat customers</option>
              {categories.map((category) => <option key={category} value={`cat:${category}`}>{category}</option>)}
            </select>
            <ErpButton icon={allShownSelected ? SquareCheckBig : Square} onClick={selectAllShown} disabled={!shownMessageable.length}>
              {allShownSelected ? 'Clear shown' : `Select all shown (${shownMessageable.length})`}
            </ErpButton>
          </div>

          {error ? <AlertBanner tone="outflow">{error}</AlertBanner> : null}
          {notice ? <AlertBanner tone="inflow">{notice}</AlertBanner> : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((row) => {
              const blocked = whatsAppBlockReason(row.phone);
              const due = balances.get(row.id) || 0;
              const isSelected = selected.has(row.id);
              return (
                <div key={row.id} className={`rounded-xl border bg-white p-4 shadow-sm ${isSelected ? 'border-emerald-400 ring-1 ring-emerald-300' : 'border-stone-200'}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0 accent-emerald-600"
                      checked={isSelected}
                      disabled={Boolean(blocked)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-semibold text-stone-950">{row.name}</h2>
                        {sent.has(row.id) ? <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800"><Check className="h-3 w-3" aria-hidden="true" />Opened</span> : null}
                      </div>
                      <p className="text-sm text-stone-600">{formatWhatsAppNumber(row.phone) || row.phone || 'No phone saved'}</p>
                      {blocked ? <p className="text-xs font-medium text-amber-700">{blocked}</p> : null}
                      {due > 0 ? <p className="mt-1 text-sm font-semibold text-rose-700">Due {money(due)}</p> : null}
                      {row.favorite_services ? <p className="mt-1 truncate text-xs text-stone-500">Likes {row.favorite_services}</p> : null}
                    </div>
                  </div>
                  <button type="button" onClick={() => sendOne(row)} disabled={Boolean(blocked)} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300">
                    <Send className="h-4 w-4" aria-hidden="true" /> WhatsApp
                  </button>
                </div>
              );
            })}
            {!shown.length ? <p className="col-span-full rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">No customers match.</p> : null}
          </div>
        </div>
      ) : null}

      {customers && (selected.size || queue) ? (
        <div className="print-hide sticky bottom-3 z-30 mt-4 rounded-2xl border border-stone-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
          {queue && current ? (
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-stone-900">Sending {queue.index + 1} of {queue.ids.length} · opened {current.name}</p>
                <p className="truncate text-xs text-stone-500">{upcoming ? `Next: ${upcoming.name} — press Send in WhatsApp, then come back and tap Open next.` : 'Last one — press Send in WhatsApp.'}</p>
              </div>
              <ErpButton icon={X} onClick={() => setQueue(null)}>Stop</ErpButton>
              {upcoming ? <ErpButton icon={SkipForward} onClick={skip}>Skip {upcoming.name.split(' ')[0]}</ErpButton> : null}
              <ErpButton variant="primary" icon={upcoming ? Send : CheckCheck} onClick={() => next()} className="bg-emerald-600 border-emerald-600 hover:bg-emerald-700">{upcoming ? 'Open next' : 'Done'}</ErpButton>
            </div>
          ) : (
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-sm font-bold text-stone-900">{selectedMessageable.length} selected</p>
              <ErpButton onClick={() => setSelected(new Set())}>Clear</ErpButton>
              <ErpButton icon={ClipboardCopy} onClick={copyNumbers} disabled={!selectedMessageable.length}>Copy numbers</ErpButton>
              <ErpButton variant="primary" icon={Send} onClick={startQueue} disabled={!selectedMessageable.length} className="bg-emerald-600 border-emerald-600 hover:bg-emerald-700">Send to selected ({selectedMessageable.length})</ErpButton>
            </div>
          )}
        </div>
      ) : null}
    </ErpPage>
  );
}
