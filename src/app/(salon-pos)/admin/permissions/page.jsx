'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, ChevronDown, History, Loader2, LockKeyhole, RotateCcw, Search, ShieldCheck, UsersRound } from 'lucide-react';

const titleCasePermission = (key) => (key.startsWith('module.') ? `Module · ${key.slice(7).charAt(0).toUpperCase()}${key.slice(8)}` : key.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' · '));
const dateTime = (value) => new Date(value).toLocaleString('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });

export default function PermissionsPage() {
  const [roles, setRoles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [protectedDenials, setProtectedDenials] = useState([]);
  const [selectedRole, setSelectedRole] = useState('cashier');
  const [openGroups, setOpenGroups] = useState(new Set(['billing']));
  const [query, setQuery] = useState('');
  const [view, setView] = useState('permissions');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState(null);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}`, 'Content-Type': 'application/json' });

  async function loadPermissions() {
    const response = await fetch('/api/admin/permissions', { headers: headers() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load permissions');
    setRoles(data.roles || []); setGroups(data.groups || []); setPermissions(data.permissions || []); setProtectedDenials(data.protectedDenials || []);
  }

  async function loadHistory() {
    const response = await fetch('/api/admin/permissions?view=history', { headers: headers() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load change history');
    setHistory(data.history || []);
  }

  useEffect(() => {
    loadPermissions().catch((error) => setNotice({ type: 'error', text: error.message })).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (view === 'history') loadHistory().catch((error) => setNotice({ type: 'error', text: error.message }));
  }, [view]);

  const role = roles.find((item) => item.key === selectedRole) || roles[0];
  const roleValues = useMemo(() => Object.fromEntries(permissions.filter((item) => item.role === selectedRole).map((item) => [item.permission_key, Boolean(item.allowed)])), [permissions, selectedRole]);
  const allPermissions = groups.flatMap((group) => group.permissions || []);
  // Two levels: a permission only takes effect while its module (module.<group>) is on.
  const moduleKey = (group) => `module.${group.key}`;
  const moduleOf = Object.fromEntries(groups.flatMap((group) => group.permissions.map((permission) => [permission.key, moduleKey(group)])));
  const effective = (key) => Boolean(roleValues[key]) && Boolean(roleValues[moduleOf[key]]);
  const allowedCount = allPermissions.filter((permission) => effective(permission.key)).length;
  const blockedCount = allPermissions.length - allowedCount;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = groups.map((group) => ({ ...group, permissions: group.permissions.filter((permission) => !normalizedQuery || `${group.label} ${permission.label} ${permission.description}`.toLowerCase().includes(normalizedQuery)) })).filter((group) => group.permissions.length);

  function isPolicyLocked(permission) {
    return selectedRole === 'cashier' && protectedDenials.includes(permission);
  }

  async function saveChanges(changes, label) {
    setSaving(label); setNotice(null);
    try {
      const response = await fetch('/api/admin/permissions', { method: 'PATCH', headers: headers(), body: JSON.stringify({ role: selectedRole, changes }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update permissions');
      await loadPermissions(); setNotice({ type: 'success', text: data.message });
    } catch (error) { setNotice({ type: 'error', text: error.message }); }
    finally { setSaving(''); }
  }

  async function togglePermission(permission) {
    if (isPolicyLocked(permission.key) || !roleValues[moduleOf[permission.key]]) return;
    await saveChanges([{ permission: permission.key, allowed: !roleValues[permission.key] }], permission.key);
  }

  // Switching a module off also switches off everything inside it (done on the server too).
  async function toggleModule(group) {
    const key = moduleKey(group);
    if (isPolicyLocked(key)) return;
    await saveChanges([{ permission: key, allowed: !roleValues[key] }], key);
  }

  async function resetRole() {
    setSaving('reset'); setNotice(null);
    try {
      const response = await fetch('/api/admin/permissions', { method: 'PATCH', headers: headers(), body: JSON.stringify({ role: selectedRole, action: 'reset' }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to reset permissions');
      await loadPermissions(); setNotice({ type: 'success', text: `${role.label} permissions restored to safe defaults.` });
    } catch (error) { setNotice({ type: 'error', text: error.message }); }
    finally { setSaving(''); }
  }

  const bulkChanges = (allowed) => [
    ...groups.map((group) => ({ permission: moduleKey(group), allowed: allowed && !isPolicyLocked(moduleKey(group)) })),
    ...allPermissions.map((permission) => ({ permission: permission.key, allowed: allowed && !isPolicyLocked(permission.key) && !isPolicyLocked(moduleOf[permission.key]) })),
  ];

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-500" /></div>;

  return (
    <main className="min-h-screen bg-[#f7f8fa]">
      <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-950 text-white shadow-[0_8px_22px_rgba(17,24,39,0.16)]"><ShieldCheck className="h-5 w-5" /></span>
            <div><h1 className="text-2xl font-semibold tracking-[-0.02em] text-gray-950 sm:text-3xl">Staff permissions</h1><p className="mt-1 max-w-2xl text-sm text-gray-600">Choose a salon role, then allow only the work that role should perform. Administrators always retain full access.</p></div>
          </div>
          <div className="inline-flex self-start rounded-xl border border-gray-200 bg-gray-50 p-1" role="tablist" aria-label="Permission views">
            <button onClick={() => setView('permissions')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'permissions' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600'}`}><ShieldCheck className="h-4 w-4" />Permissions</button>
            <button onClick={() => setView('history')} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${view === 'history' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600'}`}><History className="h-4 w-4" />Change history</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8">
        {notice ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.text}</div> : null}

        {view === 'permissions' ? <>
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_28px_rgba(17,24,39,0.05)]">
            <div className="px-5 pt-4 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Editing role</div>
            <div className="mt-1 flex overflow-x-auto border-b border-gray-200 px-3 sm:px-5" role="tablist" aria-label="Salon roles">
              {roles.map((item) => <button key={item.key} onClick={() => { setSelectedRole(item.key); setNotice(null); }} className={`inline-flex min-h-14 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-semibold ${selectedRole === item.key ? 'border-gray-950 text-gray-950' : 'border-transparent text-gray-500 hover:text-gray-800'}`}><UsersRound className="h-4 w-4" />{item.label}</button>)}
            </div>
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-semibold text-gray-950">{role?.label} access</h2><p className="text-sm text-gray-600">{role?.description}</p></div></div>
              <dl className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border border-gray-200 text-center"><div className="px-4 py-2"><dd className="text-lg font-bold text-emerald-700">{allowedCount}</dd><dt className="text-[10px] font-semibold uppercase text-gray-500">Allowed</dt></div><div className="px-4 py-2"><dd className="text-lg font-bold text-red-700">{blockedCount}</dd><dt className="text-[10px] font-semibold uppercase text-gray-500">Blocked</dt></div><div className="px-4 py-2"><dd className="text-lg font-bold text-gray-950">{allPermissions.length}</dd><dt className="text-[10px] font-semibold uppercase text-gray-500">Available</dt></div></dl>
            </div>
          </section>

          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><span className="sr-only">Search permissions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${role?.label?.toLowerCase()} permissions…`} className="min-h-12 w-full rounded-xl border border-gray-300 bg-white pl-11 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
            <div className="grid grid-cols-3 gap-2">
              <button disabled={Boolean(saving)} onClick={() => saveChanges(bulkChanges(true), 'allow-all')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"><Check className="h-4 w-4 text-emerald-600" />Allow all</button>
              <button disabled={Boolean(saving)} onClick={() => saveChanges(bulkChanges(false), 'block-all')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"><Ban className="h-4 w-4 text-red-600" />Block all</button>
              <button aria-label="Reset safe defaults" title="Reset safe defaults" disabled={Boolean(saving)} onClick={resetRole} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RotateCcw className={`h-4 w-4 ${saving === 'reset' ? 'animate-spin' : ''}`} /></button>
            </div>
          </div>

          <div className="space-y-3">
            {visibleGroups.map((group) => {
              const mKey = moduleKey(group);
              const moduleOn = Boolean(roleValues[mKey]);
              const moduleLocked = isPolicyLocked(mKey);
              const groupAllowed = group.permissions.filter((permission) => effective(permission.key)).length;
              const expanded = openGroups.has(group.key) || Boolean(normalizedQuery);
              const state = !moduleOn ? 'Off' : groupAllowed === 0 ? 'On · nothing chosen' : groupAllowed === group.permissions.length ? 'All allowed' : 'Mixed';
              const toggleOpen = () => setOpenGroups((current) => { const next = new Set(current); next.has(group.key) ? next.delete(group.key) : next.add(group.key); return next; });
              return <section key={group.key} className={`overflow-hidden rounded-2xl border bg-white ${!moduleOn ? 'border-gray-200' : state === 'Mixed' ? 'border-amber-300' : 'border-emerald-200'}`}>
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={toggleOpen} aria-expanded={expanded} className="flex min-w-0 items-center gap-3 text-left">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200"><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></span>
                    <span><span className="block font-semibold text-gray-950">{group.label}</span><span className="block text-sm text-gray-600">{group.description}</span></span>
                  </button>
                  <span className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
                    <span className="text-xs font-semibold text-gray-500">{moduleOn ? `${groupAllowed} of ${group.permissions.length} allowed` : 'Module off'}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={moduleOn}
                      aria-label={`${group.label} module`}
                      disabled={Boolean(saving) || moduleLocked}
                      onClick={() => toggleModule(group)}
                      title={moduleLocked ? 'Mandatory cashier restriction' : moduleOn ? 'Turn off this module (blocks everything inside it)' : 'Turn on this module to choose its permissions'}
                      className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-60 ${moduleOn ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-gray-700 ring-gray-300'}`}
                    >
                      <span className={`relative h-5 w-9 rounded-full transition-colors ${moduleOn ? 'bg-white/35' : 'bg-gray-300'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${moduleOn ? 'left-[18px]' : 'left-0.5'}`} /></span>
                      {saving === mKey ? <Loader2 className="h-4 w-4 animate-spin" /> : moduleLocked ? <LockKeyhole className="h-4 w-4" /> : null}
                      {moduleOn ? 'On' : 'Off'}
                    </button>
                  </span>
                </div>
                {moduleOn && state !== 'All allowed' ? <p className="-mt-2 px-5 pb-3 text-xs font-semibold text-amber-700">{state === 'Mixed' ? 'Some permissions in this module are allowed.' : 'Module is on — now choose the permissions inside it.'}</p> : null}
                {expanded ? <div className="border-t border-gray-200">{group.permissions.map((permission) => {
                  const allowed = effective(permission.key); const locked = isPolicyLocked(permission.key); const pending = saving === permission.key;
                  return <div key={permission.key} className={`flex flex-col gap-3 border-b border-gray-100 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${moduleOn ? '' : 'bg-gray-50/70'}`}><div className="pr-4"><h3 className={`text-sm font-semibold ${moduleOn ? 'text-gray-950' : 'text-gray-500'}`}>{permission.label}</h3><p className="mt-1 text-sm text-gray-600">{permission.description}</p>{locked ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><LockKeyhole className="h-3 w-3" />Mandatory cashier restriction</p> : !moduleOn ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gray-500"><LockKeyhole className="h-3 w-3" />Turn on {group.label} first</p> : null}</div><button disabled={Boolean(saving) || locked || !moduleOn} onClick={() => togglePermission(permission)} aria-pressed={allowed} className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-xl px-4 text-sm font-semibold ring-1 sm:self-auto ${allowed ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-gray-100 text-gray-700 ring-gray-200'} disabled:cursor-not-allowed disabled:opacity-65`}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : allowed ? <Check className="h-4 w-4" /> : locked || !moduleOn ? <LockKeyhole className="h-4 w-4" /> : <Ban className="h-4 w-4" />}{allowed ? 'Allowed' : 'Blocked'}</button></div>;
                })}</div> : null}
              </section>;
            })}
            {!visibleGroups.length ? <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center"><Search className="mx-auto h-6 w-6 text-gray-400" /><p className="mt-3 font-semibold text-gray-900">No permissions match “{query}”</p><button onClick={() => setQuery('')} className="mt-2 text-sm font-semibold text-blue-700">Clear search</button></div> : null}
          </div>
        </> : <HistoryPanel history={history} roles={roles} />}
      </div>
    </main>
  );
}

function HistoryPanel({ history, roles }) {
  const roleNames = Object.fromEntries(roles.map((role) => [role.key, role.label]));
  return <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="border-b border-gray-200 px-5 py-4"><h2 className="font-semibold text-gray-950">Permission change history</h2><p className="mt-1 text-sm text-gray-600">The latest 200 server-recorded permission changes. History cannot be edited here.</p></div>{history.length ? <div className="divide-y divide-gray-100">{history.map((entry) => <div key={entry.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-semibold text-gray-950">{roleNames[entry.role] || entry.role} · {titleCasePermission(entry.permission_key)}</p><p className="mt-1 text-sm text-gray-600">Changed by {entry.actor_name} · {dateTime(entry.created_at)}</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${entry.new_value ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200'}`}>{entry.new_value ? 'Allowed' : 'Blocked'}</span></div>)}</div> : <div className="px-6 py-16 text-center"><History className="mx-auto h-7 w-7 text-gray-400" /><p className="mt-3 font-semibold text-gray-900">No permission changes yet</p><p className="mt-1 text-sm text-gray-600">Updates made from this page will appear here.</p></div>}</section>;
}
