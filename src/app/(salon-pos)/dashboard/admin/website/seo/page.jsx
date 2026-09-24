'use client';

/**
 * Website CMS → SEO & Local Search.
 *
 * Plain-language controls for the PUBLIC website only: how pages appear in Google, service
 * landing pages, guides, business facts for Google, the review link, redirects and a Google
 * Business Profile checklist. Nothing here can promise rankings; it keeps the basics right.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Plus, RefreshCw, Save, Trash2, XCircle } from 'lucide-react';

const TABS = ['Overview', 'Pages', 'Service pages', 'Guides', 'Local business', 'Google Business Profile', 'Search Console', 'Redirects', 'Sitemap'];

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem('pos_token')}`, 'Content-Type': 'application/json' };
}

const input = 'min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-950 focus:border-gray-950 focus:outline-none focus:ring-2 focus:ring-gray-950/10';

function Field({ label, hint, count, limits, children }) {
  let tone = 'text-gray-500';
  if (limits && count !== undefined) tone = count === 0 ? 'text-gray-400' : count < limits[0] || count > limits[1] ? 'text-amber-700' : 'text-green-700';
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-semibold text-gray-900">
        <span>{label}</span>
        {count !== undefined ? <span className={`text-xs font-medium tabular-nums ${tone}`}>{count}{limits ? ` / ${limits[0]}–${limits[1]}` : ''}</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-gray-500">{hint}</span> : null}
    </label>
  );
}

function Text({ value, onChange, ...props }) {
  return <input {...props} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={input} />;
}

function Area({ value, onChange, rows = 3, ...props }) {
  return <textarea {...props} rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={input} />;
}

function Check({ checked, onChange, label, hint }) {
  return (
    <label className="flex min-h-11 items-start gap-3 text-sm text-gray-800">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-gray-950" />
      <span><span className="font-medium">{label}</span>{hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}</span>
    </label>
  );
}

function Card({ title, description, children, actions }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      {title ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-gray-600">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Badge({ tone = 'gray', children }) {
  const tones = { gray: 'bg-gray-100 text-gray-700', green: 'bg-green-100 text-green-800', amber: 'bg-amber-100 text-amber-800', red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-800' };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Approximate Google result: title truncated ~60 chars, description ~160. */
function SearchPreview({ url, title, description }) {
  const cut = (value, max) => (value && value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
  let display = url;
  try {
    const parsed = new URL(url);
    display = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname.split('/').join(' › ')}`;
  } catch { /* keep raw */ }
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4" aria-label="Google search preview">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Google preview (approximate)</p>
      <p className="mt-2 truncate text-xs text-gray-700">{display}</p>
      <p className="mt-0.5 text-lg leading-snug text-[#1a0dab]">{cut(title, 62) || <span className="text-gray-400">No title</span>}</p>
      <p className="mt-1 text-sm leading-snug text-gray-600">{cut(description, 160) || <span className="text-gray-400">No description — Google will pick text from the page.</span>}</p>
    </div>
  );
}

const LEVEL = {
  error: { Icon: XCircle, cls: 'text-red-600', label: 'Fix' },
  warning: { Icon: AlertTriangle, cls: 'text-amber-600', label: 'Check' },
  info: { Icon: Info, cls: 'text-blue-600', label: 'Tip' },
  ok: { Icon: CheckCircle2, cls: 'text-green-600', label: 'OK' },
};

export default function SeoLocalSearchPage() {
  const [tab, setTab] = useState('Overview');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError('');
    const response = await fetch('/api/admin/seo', { headers: headers(), cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (response.ok) setData(json);
    else setError(json.error || 'Could not load SEO settings.');
  };

  useEffect(() => { load(); }, []);

  const save = async (action, payload, done = 'Saved.') => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/admin/seo', { method: 'PUT', headers: headers(), body: JSON.stringify({ action, data: payload }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not save.');
      setData(json);
      setMessage(done);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const audit = data?.audit || [];
    return { error: audit.filter((a) => a.level === 'error').length, warning: audit.filter((a) => a.level === 'warning').length };
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-gray-500"><Link href="/dashboard/admin/website" className="hover:underline">Website CMS</Link> / SEO &amp; Local Search</p>
          <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">SEO &amp; Local Search</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">How the public website appears in Google and Maps. No tool can guarantee a ranking — this keeps the facts, pages and signals correct so Google can understand the salon.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700"><RefreshCw className="h-4 w-4" /> Re-check</button>
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700"><ExternalLink className="h-4 w-4" /> View website</a>
        </div>
      </div>

      {message ? <div role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</div> : null}
      {error ? <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {data && !data.schemaReady ? <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">SEO tables are not installed yet, so changes cannot be saved. Run <code>npm run db:migrate</code> on the server.</div> : null}

      <div className="-mx-1 mb-5 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-max gap-1 rounded-lg border border-gray-200 bg-white p-1.5" role="tablist">
          {TABS.map((name) => (
            <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => { setTab(name); setMessage(''); }} className={`min-h-10 rounded-md px-3.5 text-sm font-semibold ${tab === name ? 'bg-gray-950 text-white' : 'text-gray-700 hover:bg-gray-100'}`}>
              {name}
              {name === 'Overview' && data && counts.error + counts.warning ? <span className={`ml-2 rounded-full px-1.5 text-xs ${tab === name ? 'bg-white/20' : counts.error ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{counts.error + counts.warning}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {!data && !error ? <p className="py-16 text-center text-sm text-gray-500">Loading…</p> : null}
      {data ? (
        <>
          {tab === 'Overview' ? <Overview data={data} go={setTab} /> : null}
          {tab === 'Pages' ? <PagesTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Service pages' ? <ServicePagesTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Guides' ? <GuidesTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Local business' ? <LocalBusinessTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Google Business Profile' ? <GbpTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Search Console' ? <SearchConsoleTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Redirects' ? <RedirectsTab data={data} save={save} saving={saving} /> : null}
          {tab === 'Sitemap' ? <SitemapTab data={data} /> : null}
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Overview */

function Overview({ data, go }) {
  const order = { error: 0, warning: 1, info: 2, ok: 3 };
  const audit = [...data.audit].sort((a, b) => order[a.level] - order[b.level]);
  const livePages = data.pages.filter((p) => p.live).length + data.servicePages.filter((p) => p.live).length + data.articles.filter((a) => a.status === 'PUBLISHED').length;
  return (
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <Card title="Health checks" description="Warnings never block publishing. Fix the red ones first.">
        <ul className="divide-y divide-gray-100">
          {audit.map((item, index) => {
            const { Icon, cls, label } = LEVEL[item.level];
            return (
              <li key={index} className="flex gap-3 py-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${cls}`} aria-label={label} />
                <div className="min-w-0 text-sm"><span className="font-semibold text-gray-900">{item.area}: </span><span className="text-gray-700">{item.message}</span></div>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="space-y-5">
        <Card title="At a glance">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">Public pages</dt><dd className="text-2xl font-semibold tabular-nums">{livePages}</dd></div>
            <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">In sitemap</dt><dd className="text-2xl font-semibold tabular-nums">{data.sitemap.length}</dd></div>
            <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">Service pages live</dt><dd className="text-2xl font-semibold tabular-nums">{data.servicePages.filter((p) => p.live).length}</dd></div>
            <div className="rounded-lg bg-gray-50 p-3"><dt className="text-gray-500">Guides published</dt><dd className="text-2xl font-semibold tabular-nums">{data.articles.filter((a) => a.status === 'PUBLISHED').length}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-gray-600">Canonical website: <span className="font-semibold text-gray-900">{data.siteUrl}</span></p>
        </Card>
        <Card title="Business details used everywhere" description="Name, address and phone come from Website CMS → Contact, so the footer, contact page and Google data always match.">
          <dl className="space-y-2 text-sm">
            {[['Name', data.nap.name], ['Address', data.nap.address], ['Phone', data.nap.phone], ['Hours', data.nap.openingHours || 'Not set']].map(([k, v]) => (
              <div key={k} className="flex gap-3"><dt className="w-20 shrink-0 text-gray-500">{k}</dt><dd className="font-medium text-gray-900">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/admin/website" className="text-sm font-semibold text-blue-700 hover:underline">Edit contact details</Link>
            <button type="button" onClick={() => go('Local business')} className="text-sm font-semibold text-blue-700 hover:underline">Hours &amp; map pin</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Pages */

function PagesTab({ data, save, saving }) {
  const [path, setPath] = useState('/');
  const page = data.pages.find((p) => p.path === path);
  const [form, setForm] = useState({});
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    const o = page?.override || {};
    setForm({ seoTitle: o.seoTitle || '', metaDescription: o.metaDescription || '', ogTitle: o.ogTitle || '', ogDescription: o.ogDescription || '', ogImage: o.ogImage || '', canonicalOverride: o.canonicalOverride || '', noindex: Boolean(o.noindex) });
    setAdvanced(Boolean(o.canonicalOverride));
  }, [page]);
  if (!page) return null;
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const title = form.seoTitle || page.defaults.title;
  const description = form.metaDescription || page.defaults.description;
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <Card>
        <ul className="space-y-1">
          {data.pages.map((p) => (
            <li key={p.path}>
              <button type="button" onClick={() => setPath(p.path)} className={`flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm ${p.path === path ? 'bg-gray-950 text-white' : 'hover:bg-gray-100'}`}>
                <span className="font-semibold">{p.label}</span>
                {!p.live ? <Badge>Not live</Badge> : p.effective.noindex ? <Badge tone="amber">noindex</Badge> : p.override ? <Badge tone="blue">Custom</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`${page.label} — ${page.path}`} description={page.live ? 'Leave a field empty to use the automatic text shown in grey.' : page.liveNote}>
        <div className="grid gap-4">
          <Field label="SEO title" count={title.length} limits={[30, 65]} hint="Shown as the blue link in Google. Name the page, the business and the place — naturally.">
            <Text value={form.seoTitle} onChange={set('seoTitle')} placeholder={page.defaults.title} />
          </Field>
          <Field label="Meta description" count={description.length} limits={[70, 160]} hint="One or two sentences a person would want to read. No keyword lists.">
            <Area value={form.metaDescription} onChange={set('metaDescription')} placeholder={page.defaults.description} />
          </Field>
          <SearchPreview url={page.effective.canonical} title={title} description={description} />
          <details className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-800">Social sharing (Facebook, WhatsApp)</summary>
            <div className="mt-3 grid gap-4">
              <Field label="Share title"><Text value={form.ogTitle} onChange={set('ogTitle')} placeholder={title} /></Field>
              <Field label="Share description"><Area value={form.ogDescription} onChange={set('ogDescription')} placeholder={description} rows={2} /></Field>
              <Field label="Share image URL" hint="A real salon photo, e.g. /assets/Salon_Banner.jpeg or an uploaded image URL. 1200×630 works best."><Text value={form.ogImage} onChange={set('ogImage')} placeholder="Uses the website's default photo" /></Field>
            </div>
          </details>
          <Check checked={form.noindex} onChange={set('noindex')} label="Hide this page from Google (noindex)" hint="Only for pages with nothing useful for searchers. It is also removed from the sitemap." />
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="self-start text-xs font-semibold text-gray-500 hover:underline">{advanced ? 'Hide' : 'Show'} advanced</button>
          {advanced ? (
            <Field label="Canonical override" hint="Only if this page duplicates another page. Leave empty in almost every case.">
              <Text value={form.canonicalOverride} onChange={set('canonicalOverride')} placeholder={page.path} />
            </Field>
          ) : null}
          <div><button type="button" disabled={saving || !data.schemaReady} onClick={() => save('page', { path: page.path, ...form }, `${page.label} SEO saved.`)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save</button></div>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Service pages */

const emptyServicePage = { id: null, slug: '', name: '', heading: '', summary: '', body: '', suitableFor: '', serviceNames: [], faqs: [], related: [], image: '', imageAlt: '', status: 'DRAFT', seoTitle: '', metaDescription: '', ogImage: '', noindex: false, sortOrder: 99 };

function ServicePagesTab({ data, save, saving }) {
  const [editing, setEditing] = useState(null);
  if (editing) {
    return <ServicePageEditor data={data} initial={editing} saving={saving} onCancel={() => setEditing(null)} onSave={async (form) => { if (await save('servicePage', form, 'Service page saved.')) setEditing(null); }} />;
  }
  return (
    <Card title="Service pages" description="One useful page per real service group (e.g. /services/haircut). A page only goes live when it lists at least one service from your live price list." actions={<button type="button" onClick={() => setEditing({ ...emptyServicePage })} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New page</button>}>
      <ul className="divide-y divide-gray-100">
        {data.servicePages.map((page) => (
          <li key={page.slug} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-gray-950">{page.name} <span className="font-normal text-gray-500">/services/{page.slug}</span></p>
              <p className="mt-0.5 text-sm text-gray-600">{page.matchedServices.length ? page.matchedServices.join(', ') : 'No matching live services'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {page.live ? <Badge tone="green">Live</Badge> : page.status === 'PUBLISHED' ? <Badge tone="amber">Hidden</Badge> : <Badge>{page.status === 'DRAFT' ? 'Draft' : 'Archived'}</Badge>}
              {page.live ? <a href={`/services/${page.slug}`} target="_blank" rel="noreferrer" className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label={`Open ${page.name}`}><ExternalLink className="h-4 w-4" /></a> : null}
              <button type="button" onClick={() => setEditing({ ...page, originalSlug: page.slug })} className="min-h-10 rounded-md border border-gray-300 px-3 text-sm font-semibold">Edit</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ServicePageEditor({ data, initial, onCancel, onSave, saving }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));
  const slugChanged = initial.originalSlug && form.slug && form.slug !== initial.originalSlug;
  const title = form.seoTitle || `${form.name} in Surkhet | The Hair Cut, Birendranagar`;
  const words = form.body.split(/\s+/).filter(Boolean).length;
  return (
    <Card title={initial.originalSlug ? `Edit: ${initial.name}` : 'New service page'} description="Describe the service honestly: what happens, who it suits, how long it takes. Prices come from the live price list automatically.">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Service name"><Text value={form.name} onChange={set('name')} placeholder="Haircut" /></Field>
        <Field label="URL" hint={slugChanged ? `The old URL /services/${initial.originalSlug} will permanently redirect here.` : 'Keep it short and stable. Changing it later adds a redirect automatically.'}>
          <div className="flex items-center gap-1"><span className="text-sm text-gray-500">/services/</span><Text value={form.slug} onChange={(v) => set('slug')(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="haircut" /></div>
        </Field>
        <div className="md:col-span-2"><Field label="Page heading (H1)" count={form.heading.length}><Text value={form.heading} onChange={set('heading')} placeholder="Haircut in Birendranagar, Surkhet" /></Field></div>
        <div className="md:col-span-2"><Field label="Short summary" hint="Shown under the heading and used as the meta description unless you set one." count={form.summary.length} limits={[70, 160]}><Area value={form.summary} onChange={set('summary')} rows={2} /></Field></div>
        <div className="md:col-span-2"><Field label="Main text" hint={`${words} words. Blank line = new paragraph · "## " = sub-heading · "- " = bullet.`}><Area value={form.body} onChange={set('body')} rows={9} /></Field></div>
        <div className="md:col-span-2"><Field label="Good for"><Text value={form.suitableFor} onChange={set('suitableFor')} placeholder="Regular trims, a new style…" /></Field></div>
      </div>

      <fieldset className="mt-5 rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-900">Services on this page (from your price list)</legend>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...new Set([...data.availableServices, ...form.serviceNames])].map((name) => (
            <Check key={name} checked={form.serviceNames.includes(name)} onChange={() => toggleIn('serviceNames', name)} label={name} hint={data.availableServices.includes(name) ? '' : 'Not on the live price list'} />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-900">Related service pages</legend>
        <div className="flex flex-wrap gap-x-5">
          {data.servicePages.filter((p) => p.slug !== initial.originalSlug).map((p) => <Check key={p.slug} checked={form.related.includes(p.slug)} onChange={() => toggleIn('related', p.slug)} label={p.name} />)}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Photo URL" hint="Your own photo only. Use a descriptive file name, e.g. mens-fade-haircut-the-hair-cut-surkhet.webp"><Text value={form.image} onChange={set('image')} placeholder="/assets/Haircut1.jpg" /></Field>
        <Field label="Photo description (alt text)" hint={'Describe the photo, e.g. "Men\'s fade haircut at The Hair Cut in Birendranagar". Required to show the photo.'}><Text value={form.imageAlt} onChange={set('imageAlt')} /></Field>
      </div>

      <fieldset className="mt-4 rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-900">Questions customers really ask</legend>
        <p className="mb-3 text-xs text-gray-500">Price, booking and location questions are added automatically from your real data.</p>
        {form.faqs.map((faq, index) => (
          <div key={index} className="mb-3 grid gap-2 rounded-lg bg-gray-50 p-3">
            <Text value={faq.question} onChange={(v) => setForm((f) => ({ ...f, faqs: f.faqs.map((row, i) => (i === index ? { ...row, question: v } : row)) }))} placeholder="Question" />
            <Area value={faq.answer} onChange={(v) => setForm((f) => ({ ...f, faqs: f.faqs.map((row, i) => (i === index ? { ...row, answer: v } : row)) }))} placeholder="Answer" rows={2} />
            <button type="button" onClick={() => setForm((f) => ({ ...f, faqs: f.faqs.filter((_, i) => i !== index) }))} className="justify-self-start text-xs font-semibold text-red-600 hover:underline">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setForm((f) => ({ ...f, faqs: [...f.faqs, { question: '', answer: '' }] }))} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Plus className="h-4 w-4" /> Add question</button>
      </fieldset>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="SEO title (optional)" count={title.length} limits={[30, 65]}><Text value={form.seoTitle} onChange={set('seoTitle')} placeholder={title} /></Field>
        <Field label="Meta description (optional)" count={(form.metaDescription || form.summary).length} limits={[70, 160]}><Area value={form.metaDescription} onChange={set('metaDescription')} placeholder={form.summary} rows={2} /></Field>
        <div className="md:col-span-2"><SearchPreview url={`${data.siteUrl}/services/${form.slug || 'new-page'}`} title={title} description={form.metaDescription || form.summary} /></div>
        <Field label="Status">
          <select value={form.status} onChange={(e) => set('status')(e.target.value)} className={input}>
            <option value="DRAFT">Draft — not public</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived — not public</option>
          </select>
        </Field>
        <Field label="Order"><Text type="number" value={form.sortOrder} onChange={(v) => set('sortOrder')(Number(v))} /></Field>
        <Check checked={form.noindex} onChange={set('noindex')} label="Hide from Google (noindex)" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" disabled={saving || !data.schemaReady} onClick={() => onSave(form)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save page</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-gray-300 px-5 text-sm font-semibold">Cancel</button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Guides */

const emptyArticle = { id: null, slug: '', title: '', excerpt: '', coverImage: '', coverAlt: '', body: '', author: '', relatedServiceSlug: '', seoTitle: '', metaDescription: '', status: 'DRAFT' };

function GuidesTab({ data, save, saving }) {
  const [editing, setEditing] = useState(null);
  if (editing) {
    const form = editing;
    const set = (key) => (value) => setEditing((f) => ({ ...f, [key]: value }));
    const words = form.body.split(/\s+/).filter(Boolean).length;
    const title = form.seoTitle || `${form.title} | The Hair Cut`;
    return (
      <Card title={form.id ? `Edit guide` : 'New guide'} description="Write from real salon experience — advice your team actually gives. Quality over quantity; nothing is published until you choose Published.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Title" count={form.title.length}><Text value={form.title} onChange={set('title')} placeholder="How often should you get a haircut?" /></Field></div>
          <Field label="URL" hint="Set once. Changing it after publishing adds a redirect."><div className="flex items-center gap-1"><span className="text-sm text-gray-500">/guides/</span><Text value={form.slug} onChange={(v) => set('slug')(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="how-often-haircut" /></div></Field>
          <Field label="Author"><Text value={form.author} onChange={set('author')} placeholder="Staff name" /></Field>
          <div className="md:col-span-2"><Field label="Excerpt" count={form.excerpt.length} limits={[70, 160]}><Area value={form.excerpt} onChange={set('excerpt')} rows={2} /></Field></div>
          <div className="md:col-span-2"><Field label="Body" hint={`${words} words (at least 150 to publish). Blank line = paragraph · "## " = sub-heading · "- " = bullet.`}><Area value={form.body} onChange={set('body')} rows={14} /></Field></div>
          <Field label="Cover photo URL"><Text value={form.coverImage} onChange={set('coverImage')} /></Field>
          <Field label="Cover photo description (alt text)"><Text value={form.coverAlt} onChange={set('coverAlt')} /></Field>
          <Field label="Related service">
            <select value={form.relatedServiceSlug} onChange={(e) => set('relatedServiceSlug')(e.target.value)} className={input}>
              <option value="">None</option>
              {data.servicePages.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => set('status')(e.target.value)} className={input}>
              <option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option>
            </select>
          </Field>
          <Field label="SEO title (optional)" count={title.length} limits={[30, 65]}><Text value={form.seoTitle} onChange={set('seoTitle')} placeholder={title} /></Field>
          <Field label="Meta description (optional)"><Area value={form.metaDescription} onChange={set('metaDescription')} placeholder={form.excerpt} rows={2} /></Field>
          <div className="md:col-span-2"><SearchPreview url={`${data.siteUrl}/guides/${form.slug || 'new-guide'}`} title={title} description={form.metaDescription || form.excerpt} /></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={saving || !data.schemaReady} onClick={async () => { if (await save('article', form, 'Guide saved.')) setEditing(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save guide</button>
          <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-lg border border-gray-300 px-5 text-sm font-semibold">Cancel</button>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Guides" description="Helpful articles (e.g. fade maintenance, hair colour aftercare, hair care in Surkhet heat and dust). The Guides page appears on the website only once one is published." actions={<button type="button" onClick={() => setEditing({ ...emptyArticle })} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New guide</button>}>
      {data.articles.length ? (
        <ul className="divide-y divide-gray-100">
          {data.articles.map((article) => (
            <li key={article.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="font-semibold text-gray-950">{article.title}</p><p className="text-sm text-gray-500">/guides/{article.slug}</p></div>
              <div className="flex items-center gap-2">
                <Badge tone={article.status === 'PUBLISHED' ? 'green' : 'gray'}>{article.status.toLowerCase()}</Badge>
                <button type="button" onClick={() => setEditing({ ...emptyArticle, ...article })} className="min-h-10 rounded-md border border-gray-300 px-3 text-sm font-semibold">Edit</button>
                {article.status !== 'PUBLISHED' ? <button type="button" onClick={() => save('deleteArticle', { id: article.id }, 'Guide deleted.')} className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${article.title}`}><Trash2 className="h-4 w-4" /></button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No guides yet.</p>}
    </Card>
  );
}

/* ------------------------------------------------------------------ Local business / GBP / Search Console (all in settings) */

function useSettingsForm(data) {
  const [form, setForm] = useState(data.settings);
  useEffect(() => { setForm(data.settings); }, [data.settings]);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  return [form, setForm, set];
}

function SaveSettings({ form, save, saving, data }) {
  return <button type="button" disabled={saving || !data.schemaReady} onClick={() => save('settings', form, 'Settings saved.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" /> Save</button>;
}

function coordsFromEmbed(url) {
  const lng = /!2d(-?\d+\.\d+)/.exec(url || '');
  const lat = /!3d(-?\d+\.\d+)/.exec(url || '');
  return lat && lng ? { latitude: lat[1], longitude: lng[1] } : null;
}

function LocalBusinessTab({ data, save, saving }) {
  const [form, setForm, set] = useSettingsForm(data);
  const embed = coordsFromEmbed(data.nap.mapEmbedUrl);
  const setHour = (day, patch) => setForm((f) => ({ ...f, hours: f.hours.map((row) => (row.day === day ? { ...row, ...patch } : row)) }));
  return (
    <div className="grid gap-5">
      <Card title="What the salon is" description="Used in the homepage heading, page titles and Google's structured data. Must be true.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Short description" hint={'Shown as e.g. "Men\'s salon in Birendranagar, Surkhet". Change to "Unisex salon" only if you serve everyone.'}><Text value={form.businessDescriptor} onChange={set('businessDescriptor')} /></Field>
          <Field label="Google business type">
            <select value={form.businessType} onChange={(e) => set('businessType')(e.target.value)} className={input}>
              <option value="HairSalon">Hair salon</option><option value="BarberShop">Barber shop</option><option value="BeautySalon">Beauty salon</option>
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Address for Google" description={`Name, phone and the display address come from Website CMS → Contact: "${data.nap.address}". These parts only add structure.`}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Street / ward"><Text value={form.streetAddress} onChange={set('streetAddress')} /></Field>
          <Field label="City / municipality"><Text value={form.locality} onChange={set('locality')} /></Field>
          <Field label="District"><Text value={form.district} onChange={set('district')} /></Field>
          <Field label="Province"><Text value={form.region} onChange={set('region')} /></Field>
          <Field label="Postal code (optional)"><Text value={form.postalCode} onChange={set('postalCode')} /></Field>
          <Field label="Country code"><Text value={form.country} onChange={(v) => set('country')(v.toUpperCase().slice(0, 2))} /></Field>
          <div className="md:col-span-2"><Field label="Landmark (optional)" hint="Only if it genuinely helps people find you."><Text value={form.landmark} onChange={set('landmark')} /></Field></div>
          <Field label="Parking (optional)"><Text value={form.parking} onChange={set('parking')} /></Field>
        </div>
      </Card>
      <Card title="Map pin" description="Exact coordinates of the shop entrance. Copy them from Google Maps (right-click the pin → the numbers at the top).">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Latitude"><Text value={form.latitude} onChange={set('latitude')} placeholder="28.60…" inputMode="decimal" /></Field>
          <Field label="Longitude"><Text value={form.longitude} onChange={set('longitude')} placeholder="81.62…" inputMode="decimal" /></Field>
          <div className="flex items-end">{embed ? <button type="button" onClick={() => setForm((f) => ({ ...f, ...embed }))} className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-semibold">Fill from website map ({embed.latitude}, {embed.longitude})</button> : null}</div>
        </div>
        <p className="mt-2 text-xs text-gray-500">The website map&apos;s centre is usually the pin, but check it matches before saving.</p>
        <div className="mt-4"><Field label="Google Maps link to the salon (optional)" hint="The Share link from your Google Business Profile. Used for the Directions buttons."><Text value={form.googleMapsUrl} onChange={set('googleMapsUrl')} placeholder="https://maps.app.goo.gl/…" /></Field></div>
      </Card>
      <Card title="Opening hours" description="One source for the website, footer and Google data. Nepal week order.">
        <div className="grid gap-2">
          {form.hours.map((row) => (
            <div key={row.day} className="grid grid-cols-[96px_1fr] items-center gap-3 sm:grid-cols-[120px_120px_1fr_1fr]">
              <span className="text-sm font-semibold text-gray-900">{row.day}</span>
              <Check checked={row.closed} onChange={(v) => setHour(row.day, { closed: v })} label="Closed" />
              {!row.closed ? <>
                <input type="time" aria-label={`${row.day} opens`} value={row.opens} onChange={(e) => setHour(row.day, { opens: e.target.value })} className={`${input} col-start-2 sm:col-start-auto`} />
                <input type="time" aria-label={`${row.day} closes`} value={row.closes} onChange={(e) => setHour(row.day, { closes: e.target.value })} className={`${input} col-start-2 sm:col-start-auto`} />
              </> : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setForm((f) => ({ ...f, hours: f.hours.map((row) => ({ ...row, opens: f.hours[1].opens, closes: f.hours[1].closes, closed: f.hours[1].closed })) }))} className="mt-3 text-xs font-semibold text-blue-700 hover:underline">Copy Monday to every day</button>
      </Card>
      <Card title="Other facts">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Price range (optional)" hint="Leave empty to use the lowest and highest price on your list."><Text value={form.priceRange} onChange={set('priceRange')} placeholder="Rs 50–1800" /></Field>
          <Field label="Facebook / TikTok" hint="Edited in Website CMS → Contact."><Text value={[data.nap.facebook, data.nap.tiktok].filter(Boolean).join(' · ')} onChange={() => {}} disabled /></Field>
          <Field label="Instagram (only if a real account exists)"><Text value={form.instagram} onChange={set('instagram')} placeholder="https://www.instagram.com/…" /></Field>
          <Field label="YouTube (only if a real account exists)"><Text value={form.youtube} onChange={set('youtube')} placeholder="https://www.youtube.com/@…" /></Field>
        </div>
      </Card>
      <Card title="Google review link" description="Offered on the Review & Rewards page to every customer — the same for a 1-star or 5-star visit. Never rewarded, never required.">
        <div className="grid gap-4">
          <Field label="Google review URL" hint="Google Business Profile → Ask for reviews → copy link (https://g.page/r/…/review)."><Text value={form.googleReviewUrl} onChange={set('googleReviewUrl')} placeholder="https://g.page/r/…/review" /></Field>
          <Check checked={form.googleReviewEnabled} onChange={set('googleReviewEnabled')} label="Show “Review us on Google” on the Review & Rewards page" />
        </div>
      </Card>
      <div><SaveSettings form={form} save={save} saving={saving} data={data} /></div>
    </div>
  );
}

function GbpTab({ data, save, saving }) {
  const [form, setForm] = useSettingsForm(data);
  const setItem = (key, patch) => setForm((f) => ({ ...f, gbpChecklist: { ...f.gbpChecklist, [key]: { ...f.gbpChecklist[key], ...patch } } }));
  const done = data.gbpChecklist.filter((item) => form.gbpChecklist[item.key]?.status !== 'todo').length;
  return (
    <div className="grid gap-5">
      <Card title="Google Business Profile checklist" description={`${done} of ${data.gbpChecklist.length} checked. Edit the profile itself at business.google.com — this system does not change it.`}>
        <ul className="divide-y divide-gray-100">
          {data.gbpChecklist.map((item) => {
            const row = form.gbpChecklist[item.key] || { status: 'todo', note: '' };
            return (
              <li key={item.key} className="grid gap-2 py-3 md:grid-cols-[1fr_160px_1fr] md:items-center">
                <div><p className="font-semibold text-gray-950">{item.label}</p><p className="text-xs text-gray-500">{item.hint}</p></div>
                <select value={row.status} onChange={(e) => setItem(item.key, { status: e.target.value })} className={input} aria-label={`${item.label} status`}>
                  <option value="todo">To check</option><option value="done">Correct</option><option value="na">Not applicable</option>
                </select>
                <Text value={row.note} onChange={(v) => setItem(item.key, { note: v })} placeholder="Note (optional)" aria-label={`${item.label} note`} />
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title="Services to list on Google" description="Copy these exactly so Google, the website and the counter all agree.">
        <div className="flex flex-wrap gap-2">{data.availableServices.map((name) => <Badge key={name}>{name}</Badge>)}</div>
        <div className="mt-4 grid gap-1 text-sm text-gray-700">
          <p>Website: <span className="font-semibold">{data.siteUrl}/</span></p>
          <p>Booking link: <span className="font-semibold">{data.siteUrl}/book-appointment</span></p>
          <p>Name: <span className="font-semibold">{data.nap.name}</span> · Phone: <span className="font-semibold">{data.nap.phone}</span></p>
          <p>Address: <span className="font-semibold">{data.nap.address}</span></p>
        </div>
      </Card>
      <Card title="Local listings (citations)" description="A few real, trusted listings with exactly the same name, address and phone. Never bulk-submit to spam directories or buy links.">
        {form.citations.map((row, index) => (
          <div key={index} className="mb-2 grid gap-2 md:grid-cols-[1fr_1.4fr_140px_auto]">
            <Text value={row.name} onChange={(v) => setForm((f) => ({ ...f, citations: f.citations.map((c, i) => (i === index ? { ...c, name: v } : c)) }))} placeholder="e.g. Facebook page" aria-label="Listing name" />
            <Text value={row.url} onChange={(v) => setForm((f) => ({ ...f, citations: f.citations.map((c, i) => (i === index ? { ...c, url: v } : c)) }))} placeholder="https://…" aria-label="Listing URL" />
            <select value={row.status} onChange={(e) => setForm((f) => ({ ...f, citations: f.citations.map((c, i) => (i === index ? { ...c, status: e.target.value } : c)) }))} className={input} aria-label="Listing status">
              <option value="todo">To check</option><option value="listed">Correct</option><option value="needs-fix">Needs fixing</option>
            </select>
            <button type="button" onClick={() => setForm((f) => ({ ...f, citations: f.citations.filter((_, i) => i !== index) }))} className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label="Remove listing"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setForm((f) => ({ ...f, citations: [...f.citations, { name: '', url: '', status: 'todo', note: '' }] }))} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"><Plus className="h-4 w-4" /> Add listing</button>
      </Card>
      <div><SaveSettings form={form} save={save} saving={saving} data={data} /></div>
    </div>
  );
}

function SearchConsoleTab({ data, save, saving }) {
  const [form, setForm, set] = useSettingsForm(data);
  const [keyword, setKeyword] = useState('');
  const steps = [
    'Add the property in Google Search Console (Domain property with a DNS TXT record is best; or URL-prefix https://thehaircut.com.np/ with the HTML tag below).',
    `Submit the sitemap: ${data.siteUrl}/sitemap.xml`,
    'URL Inspection → inspect the homepage and each service page → Request indexing.',
    'Check Pages (indexing) weekly for errors; fix, then Validate fix.',
    'Check Core Web Vitals (mobile) after a few weeks of traffic.',
    'Performance → Queries: see which searches show the site, then improve those pages with real detail.',
  ];
  return (
    <div className="grid gap-5">
      <Card title="Verification" description="Only the public token goes on the website. Never paste passwords or API keys here.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Google Search Console HTML tag" hint={'Paste the whole <meta name="google-site-verification" …> tag or just its content value.'}><Text value={form.gscVerification} onChange={set('gscVerification')} /></Field>
          <Field label="Bing Webmaster token (optional)"><Text value={form.bingVerification} onChange={set('bingVerification')} /></Field>
        </div>
        <div className="mt-4"><SaveSettings form={form} save={save} saving={saving} data={data} /></div>
      </Card>
      <Card title="After each deployment">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">{steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <p className="mt-3 text-sm text-gray-600">Indexing is Google&apos;s decision and takes days to weeks. Nothing here can make it instant.</p>
      </Card>
      <Card title="Performance" description="Organic clicks, impressions, CTR, average position, top queries and landing pages.">
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          Not connected. Search data is shown only from a verified Google Search Console account — no numbers are estimated here.
          Until an API connection is set up, open <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">Search Console</a> → Performance.
          Bookings, calls and WhatsApp taps from the website can be compared against Appointments in this system.
        </p>
      </Card>
      <Card title="Search watchlist" description="Searches to check in Search Console → Performance → Queries. This is a list only — rankings are not scraped from Google.">
        <div className="flex flex-wrap gap-2">
          {form.keywords.map((kw) => (
            <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-sm">
              {kw}
              <button type="button" onClick={() => setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== kw) }))} className="rounded-full p-1 text-gray-500 hover:bg-gray-200" aria-label={`Remove ${kw}`}><XCircle className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (keyword.trim()) { setForm((f) => ({ ...f, keywords: [...new Set([...f.keywords, keyword.trim()])] })); setKeyword(''); } }} className="mt-3 flex gap-2">
          <Text value={keyword} onChange={setKeyword} placeholder="e.g. beard trim Surkhet" aria-label="New search phrase" />
          <button type="submit" className="min-h-11 shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-semibold">Add</button>
        </form>
        <div className="mt-4"><SaveSettings form={form} save={save} saving={saving} data={data} /></div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Redirects & sitemap */

function RedirectsTab({ data, save, saving }) {
  const [form, setForm] = useState({ from: '', to: '', note: '' });
  return (
    <div className="grid gap-5">
      <Card title="Add a permanent redirect" description="Only for a public page that moved. Don't send missing pages to the homepage — a real 404 is better. Renaming a service page or guide URL adds one automatically.">
        <form onSubmit={async (e) => { e.preventDefault(); if (await save('redirect', form, 'Redirect added.')) setForm({ from: '', to: '', note: '' }); }} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
          <Field label="Old path"><Text value={form.from} onChange={(v) => setForm((f) => ({ ...f, from: v }))} placeholder="/old-page" /></Field>
          <Field label="New path"><Text value={form.to} onChange={(v) => setForm((f) => ({ ...f, to: v }))} placeholder="/services/haircut" /></Field>
          <Field label="Note"><Text value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))} placeholder="Why it moved" /></Field>
          <button type="submit" disabled={saving || !data.schemaReady} className="min-h-11 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white disabled:opacity-50">Add</button>
        </form>
      </Card>
      <Card title="Redirects">
        {data.redirects.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b text-left text-gray-500"><th className="py-2 pr-3 font-semibold">From</th><th className="py-2 pr-3 font-semibold">To</th><th className="py-2 pr-3 font-semibold">Used</th><th className="py-2 pr-3 font-semibold">Active</th><th /></tr></thead>
              <tbody>
                {data.redirects.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 font-mono">{row.from}</td>
                    <td className="py-2 pr-3 font-mono">{row.to}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.hits}</td>
                    <td className="py-2 pr-3"><input type="checkbox" checked={row.isActive} onChange={(e) => save('toggleRedirect', { id: row.id, isActive: e.target.checked }, 'Redirect updated.')} aria-label={`Redirect ${row.from} active`} className="h-4 w-4" /></td>
                    <td className="py-2 text-right"><button type="button" onClick={() => save('deleteRedirect', { id: row.id }, 'Redirect removed.')} className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label={`Delete redirect ${row.from}`}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="rounded-lg border border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">No redirects.</p>}
      </Card>
    </div>
  );
}

function SitemapTab({ data }) {
  return (
    <div className="grid gap-5">
      <Card title="Sitemap" description="Built automatically: only public, indexable pages. Admin, cashier, API, login and customer pages are never included.">
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">Open sitemap.xml</a>
          <a href="/robots.txt" target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">Open robots.txt</a>
        </div>
        <ul className="divide-y divide-gray-100 font-mono text-sm">{data.sitemap.map((url) => <li key={url} className="py-1.5 break-all">{url}</li>)}</ul>
      </Card>
      <Card title="Kept out of Google">
        <p className="text-sm text-gray-700">Admin, dashboards, cashier, store, appointments management, attendance, API, login, activation, the Review &amp; Rewards QR page and the placeholder legal pages send <code>X-Robots-Tag: noindex</code>. Login is what actually keeps private data private.</p>
      </Card>
    </div>
  );
}
