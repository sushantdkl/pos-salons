'use client';

/**
 * Manage expense categories (admin). Add your own, regroup, hide / show, rename or remove your
 * own ones. Built-in categories can only be hidden; Staff Salary / Commission are always on.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, EyeOff, Lock, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { erpFetch } from '@/components/erp/use-report';
import { SidePanel } from '@/components/shared/side-panel';

const FIELD = 'h-10 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-stone-500';

export function CategoryManager({ onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({ label: '', group: 'Anything else' });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await erpFetch('/api/admin/expense-categories')); } catch (loadError) { setError(loadError.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); await load(); onChanged?.(); } catch (runError) { setError(runError.message); } finally { setBusy(false); }
  };
  const add = () => run(async () => {
    await erpFetch('/api/admin/expense-categories', { method: 'POST', body: draft });
    setDraft({ label: '', group: draft.group });
  });
  const update = (body) => run(() => erpFetch('/api/admin/expense-categories', { method: 'PUT', body }));
  const remove = (id) => run(() => erpFetch(`/api/admin/expense-categories?id=${id}`, { method: 'DELETE' }));

  const groups = data?.groups || [];
  return (
    <SidePanel eyebrow="Expenses" icon={Tags} title="Manage categories" subtitle="Your own categories appear in the New expense picker." onClose={onClose}>
      <div className="space-y-5">
        {error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
        <section className="rounded-xl border border-stone-200 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">Add a category</p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_auto]">
            <input value={draft.label} onChange={(event) => setDraft((d) => ({ ...d, label: event.target.value }))} placeholder="e.g. Laundry, Generator fuel" maxLength={60} className={FIELD} />
            <select value={draft.group} onChange={(event) => setDraft((d) => ({ ...d, group: event.target.value }))} className={FIELD}>
              {groups.map((group) => <option key={group} value={group}>{group}</option>)}
            </select>
            <button type="button" onClick={add} disabled={busy || draft.label.trim().length < 2} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white disabled:opacity-40"><Plus className="h-4 w-4" />Add</button>
          </div>
        </section>
        {!data ? <p className="py-6 text-center text-sm text-stone-400">Loading…</p> : groups.map((group) => {
          const rows = data.categories.filter((category) => category.group === group);
          if (!rows.length) return null;
          return (
            <section key={group}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-400">{group}</p>
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {rows.map((category) => (
                  <li key={category.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${category.isActive ? '' : 'bg-stone-50'}`}>
                    {editing?.id === category.id ? (
                      <>
                        <input value={editing.label} onChange={(event) => setEditing((e) => ({ ...e, label: event.target.value }))} className={`${FIELD} h-9 min-w-0 flex-1`} autoFocus />
                        <button type="button" aria-label="Save name" onClick={() => { update({ id: category.id, label: editing.label }); setEditing(null); }} className="grid h-9 w-9 place-items-center rounded-lg bg-stone-900 text-white"><Check className="h-4 w-4" /></button>
                        <button type="button" aria-label="Cancel" onClick={() => setEditing(null)} className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"><X className="h-4 w-4" /></button>
                      </>
                    ) : (
                      <>
                        <span className={`min-w-0 flex-1 text-sm font-semibold ${category.isActive ? 'text-stone-900' : 'text-stone-400 line-through'}`}>
                          {category.label}
                          <span className="ml-2 text-xs font-normal text-stone-400">{category.usage || 0} used{category.isSystem ? ' · built-in' : ''}</span>
                        </span>
                        <select aria-label={`Group for ${category.label}`} value={category.group} disabled={busy} onChange={(event) => update({ id: category.id, group: event.target.value })} className={`${FIELD} h-9 text-xs`}>
                          {groups.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        {category.isLocked ? <span title="Used by payroll" className="grid h-9 w-9 place-items-center text-stone-400"><Lock className="h-4 w-4" /></span> : (
                          <button type="button" disabled={busy} onClick={() => update({ id: category.id, isActive: !category.isActive })} aria-label={category.isActive ? `Hide ${category.label}` : `Show ${category.label}`} title={category.isActive ? 'Hide from the picker' : 'Show in the picker'} className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100">
                            {category.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                        )}
                        {!category.isSystem ? (
                          <>
                            <button type="button" aria-label={`Rename ${category.label}`} onClick={() => setEditing({ id: category.id, label: category.label })} className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"><Pencil className="h-4 w-4" /></button>
                            <button type="button" aria-label={`Remove ${category.label}`} disabled={busy || category.usage > 0} title={category.usage > 0 ? 'In use — hide it instead' : 'Remove'} onClick={() => remove(category.id)} className="grid h-9 w-9 place-items-center rounded-lg text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                          </>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <p className="text-xs text-stone-500">Renaming your own category also renames it on the expenses that already use it. A category that is in use can be hidden but not removed, so old records keep their name.</p>
      </div>
    </SidePanel>
  );
}
