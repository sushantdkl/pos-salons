'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { count, humanize, money, StatusBadge, TONES } from '@/components/erp';
import { BillDetailDrawer, BillLink } from '@/components/bills/bill-detail';
import { ExportButtons } from '@/components/exports/export-buttons';
import { formatCalendarDate } from '@/lib/dates/calendar';

// One colour per status word, everywhere a status cell appears.
const STATUS_TONES = {
  paid: 'inflow', active: 'inflow', collection: 'inflow', payment: 'inflow', recovered: 'inflow', service: 'ops', product: 'inflow',
  void: 'outflow', voided: 'outflow', cancelled: 'outflow', refund: 'outflow', credit_sale: 'outflow',
  cash: 'cash', online: 'online', esewa_phonepay: 'online', bank: 'online', qr: 'online', credit: 'ledger', split: 'ops', mixed: 'ops',
  pending: 'cash', partial: 'cash', issued: 'hrm', no_show: 'outflow', completed: 'inflow', confirmed: 'online', credit_collection: 'inflow', collection_reversal: 'outflow',
};
const LABELS = { esewa_phonepay: 'eSewa / PhonePay', bank: 'Bank QR' };

export function statusLabel(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (LABELS[text.toLowerCase()]) return LABELS[text.toLowerCase()];
  return /^[A-Za-z0-9_]+$/.test(text) ? humanize(text.toUpperCase()) : text;
}

const NUMERIC = new Set(['money', 'number', 'percent']);

function timeText(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit' });
}

/** Plain text of a cell (search, CSV/Excel). */
export function cellText(column, row, calendarSystem) {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return column.type === 'bill' && row[column.idKey] ? `Bill #${row[column.idKey]}` : '';
  if (column.type === 'date') return formatCalendarDate(String(value).slice(0, 10), calendarSystem);
  if (column.type === 'datetime') return `${formatCalendarDate(value, calendarSystem)} · ${timeText(value)}`;
  if (column.type === 'status') return statusLabel(value);
  return value;
}

function sortValue(column, row) {
  const value = row[column.key];
  if (NUMERIC.has(column.type)) return Number(value || 0);
  if (column.type === 'date' || column.type === 'datetime') return String(value || '');
  return String(value ?? '').toLowerCase();
}

function Cell({ column, row, calendarSystem }) {
  const value = row[column.key];
  const t = TONES[column.tone] || null;
  if (column.type === 'bill') return row[column.idKey] ? <BillLink billId={row[column.idKey]} number={value} /> : <span className="text-stone-300">—</span>;
  if (value === null || value === undefined || value === '') return <span className="text-stone-300">—</span>;
  if (column.type === 'money') {
    if (Number(value) === 0) return <span className="text-stone-300">{money(0)}</span>;
    return <span className={`${column.strong ? 'font-bold text-stone-900' : `font-semibold ${t ? t.text : 'text-stone-800'}`}`}>{money(value)}</span>;
  }
  if (column.type === 'number') return <span className={`font-semibold ${t ? t.text : 'text-stone-800'}`}>{count(value)}</span>;
  if (column.type === 'percent') {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-stone-100 sm:inline-block"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} /></span>
        <span className="w-12 font-semibold text-stone-700">{Number(value || 0).toFixed(1)}%</span>
      </span>
    );
  }
  if (column.type === 'status') return <StatusBadge label={statusLabel(value)} tone={STATUS_TONES[String(value).toLowerCase()] || 'neutral'} />;
  if (column.type === 'date' || column.type === 'datetime') return <span className="tabular-nums text-stone-700">{cellText(column, row, calendarSystem)}</span>;
  const sub = column.subKey && row[column.subKey] ? <span className="block text-xs text-stone-400">{row[column.subKey]}</span> : null;
  if (column.type === 'customer' && row[column.idKey]) {
    return <span><Link href={`/admin/customers/${row[column.idKey]}`} onClick={(event) => event.stopPropagation()} className="font-semibold text-indigo-700 hover:underline">{value}</Link>{sub}</span>;
  }
  return (
    <span className={`${column.strong ? 'font-semibold text-stone-900' : column.muted ? 'text-stone-500' : 'text-stone-800'} ${column.muted ? 'block max-w-[260px] truncate' : ''}`} title={column.muted ? String(value) : undefined}>
      {String(value)}{sub}
    </span>
  );
}

/** Excel/CSV columns from a table spec. */
export function exportColumnsFor(columns, calendarSystem) {
  return columns.map((column) => ({
    header: column.label,
    key: column.key,
    type: column.type === 'money' ? 'money' : column.type === 'number' ? 'number' : column.type === 'percent' ? 'percent' : column.type === 'status' ? 'status' : 'text',
    tone: column.tone || (column.type === 'bill' ? 'ledger' : undefined),
    bold: column.strong || column.type === 'bill',
    value: (row) => (NUMERIC.has(column.type) ? row[column.key] : cellText(column, row, calendarSystem)),
  }));
}

const PAGE_SIZES = [25, 50, 100, 250];

/**
 * A report table: title + count, own search, sortable headers, sticky TOTAL row (server
 * totals), paging and Excel/CSV of every matching row.
 */
export function ReportTable({
  title, columns, rows = [], totals = {}, calendarSystem = 'AD', globalSearch = '', exportName, exportSubtitle,
  empty = 'No records in the selected period.', note, truncated = false, defaultPageSize = 50,
}) {
  const [search, setSearch] = useState('');
  // exportOnly columns stay out of the grid; their totals show as a split in the TOTAL row.
  const shown = useMemo(() => columns.filter((column) => !column.exportOnly), [columns]);
  const split = columns.filter((column) => column.exportOnly && totals?.[column.key] !== undefined);
  const labelSpan = Math.max(1, shown.findIndex((column) => NUMERIC.has(column.type)));
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  // A row that belongs to a bill opens that bill wherever it is clicked.
  const [openBill, setOpenBill] = useState(null);
  const billColumn = columns.find((column) => column.type === 'bill');
  const billIdOf = (row) => (billColumn ? row[billColumn.idKey] : null);

  const needle = `${globalSearch} ${search}`.trim().toLowerCase();
  const filtered = useMemo(() => {
    const terms = needle.split(/\s+/).filter(Boolean);
    let list = rows;
    if (terms.length) {
      list = rows.filter((row) => {
        const haystack = columns.map((column) => `${cellText(column, row, calendarSystem)} ${column.subKey ? row[column.subKey] || '' : ''}`).join(' ').toLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
    }
    if (sort) {
      const column = columns.find((item) => item.key === sort.key);
      if (column) {
        list = [...list].sort((a, b) => {
          const x = sortValue(column, a);
          const y = sortValue(column, b);
          return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
        });
      }
    }
    return list;
  }, [rows, columns, needle, sort, calendarSystem]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const hasTotals = Object.keys(totals || {}).length > 0 && rows.length > 0;
  const filteredView = needle.length > 0;

  const toggleSort = (column) => {
    setPage(1);
    setSort((value) => {
      if (value?.key !== column.key) return { key: column.key, dir: NUMERIC.has(column.type) || column.type.startsWith('date') ? 'desc' : 'asc' };
      if (value.dir === 'desc') return { key: column.key, dir: 'asc' };
      return null;
    });
  };

  const sheet = () => {
    const firstText = columns.find((column) => !NUMERIC.has(column.type))?.key;
    return [{
      name: title,
      columns: exportColumnsFor(columns, calendarSystem),
      rows: filtered,
      totals: hasTotals && !filteredView ? { ...totals, ...(firstText ? { [firstText]: 'TOTAL' } : {}) } : undefined,
      note: filteredView ? `Filtered by search "${needle}" — ${filtered.length} of ${rows.length} records.` : note,
    }];
  };

  const pageButton = 'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-[15px] font-bold text-stone-900">{title}</h2>
          <span className="text-xs text-stone-400">{filteredView ? `${count(filtered.length)} of ${count(rows.length)}` : count(rows.length)} {rows.length === 1 ? 'record' : 'records'}</span>
        </div>
        <div className="print-hide flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-60 sm:flex-none">
            <span className="sr-only">Search {title}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search this table…" className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none" />
          </label>
          <ExportButtons compact filename={`${exportName || title}`} title={title} subtitle={exportSubtitle} getSheets={async () => sheet()} disabled={!filtered.length} />
        </div>
      </div>
      {truncated ? <p className="border-t border-amber-100 bg-amber-50 px-5 py-2 text-xs font-semibold text-amber-800">Showing the latest 5,000 records. Narrow the period or filters to see everything.</p> : null}
      <div className="max-h-[620px] overflow-auto border-t border-stone-100">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {shown.map((column) => {
                const active = sort?.key === column.key;
                const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                const numeric = NUMERIC.has(column.type);
                const t = TONES[column.tone];
                return (
                  <th key={column.key} scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`sticky top-0 z-10 whitespace-nowrap border-b border-stone-200 bg-stone-50 px-4 py-2.5 ${numeric ? 'text-right' : 'text-left'}`}>
                    <button type="button" onClick={() => toggleSort(column)} className={`inline-flex items-center gap-1 text-[12px] font-bold ${active ? 'text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}>
                      {t ? <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" /> : null}
                      {column.label}
                      <Icon className={`h-3 w-3 ${active ? 'text-stone-700' : 'text-stone-300'}`} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={shown.length} className="px-4 py-12 text-center text-sm text-stone-400">{rows.length ? 'No records match your search.' : empty}</td></tr>
            ) : visible.map((row, index) => (
              <tr
                key={row.id ?? `${current}-${index}`}
                className={`hover:bg-stone-50/80 ${billIdOf(row) ? 'cursor-pointer focus:bg-indigo-50/60 focus:outline-none' : ''}`}
                onClick={billIdOf(row) ? () => setOpenBill(billIdOf(row)) : undefined}
                onKeyDown={billIdOf(row) ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpenBill(billIdOf(row)); } } : undefined}
                tabIndex={billIdOf(row) ? 0 : undefined}
                title={billIdOf(row) ? 'Open bill details' : undefined}
              >
                {shown.map((column) => (
                  <td key={column.key} className={`whitespace-nowrap border-b border-stone-100 px-4 py-2.5 ${NUMERIC.has(column.type) ? 'text-right tabular-nums' : ''}`}>
                    <Cell column={column} row={row} calendarSystem={calendarSystem} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotals ? (
            <tfoot>
              <tr>
                {shown.map((column, index) => {
                  if (index > 0 && index < labelSpan) return null;
                  const value = totals[column.key];
                  const t = TONES[column.tone];
                  let content = null;
                  if (index === 0) {
                    content = (
                      <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        <span className="text-[12px] font-extrabold uppercase tracking-wide text-stone-900">{filteredView ? `Total · all ${count(rows.length)}` : 'Total'}</span>
                        {split.map((item) => (
                          <span key={item.key} className="text-[13px] font-semibold text-stone-600">
                            {item.label} <span className={(TONES[item.tone] || TONES.neutral).strong}>{money(totals[item.key])}</span>
                          </span>
                        ))}
                      </span>
                    );
                  } else if (value !== undefined && column.type === 'money') content = <span className={column.strong ? 'text-stone-900' : t ? t.strong : 'text-stone-900'}>{money(value)}</span>;
                  else if (value !== undefined && column.type === 'number') content = count(value);
                  else if (value !== undefined && column.type === 'percent') content = '100%';
                  return (
                    <td key={column.key} colSpan={index === 0 ? labelSpan : undefined} className={`sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-stone-300 bg-stone-100 px-4 py-3 font-bold tabular-nums text-stone-900 ${NUMERIC.has(column.type) ? 'text-right' : ''}`}>
                      {content}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <div className="print-hide flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-4 py-3 text-[13px] text-stone-500 sm:px-5">
        <span>{filtered.length ? `Showing ${count((current - 1) * pageSize + 1)}–${count(Math.min(current * pageSize, filtered.length))} of ${count(filtered.length)}` : 'No rows'}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="mr-2 inline-flex items-center gap-2">Rows
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-[13px] font-semibold text-stone-700">
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button type="button" className={pageButton} disabled={current <= 1} onClick={() => setPage(1)} aria-label="First page"><ChevronsLeft className="h-4 w-4" /><span className="hidden sm:inline">First</span></button>
          <button type="button" className={pageButton} disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Prev</span></button>
          <span className="px-2 font-semibold text-stone-700">Page {current} of {pages}</span>
          <button type="button" className={pageButton} disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></button>
          <button type="button" className={pageButton} disabled={current >= pages} onClick={() => setPage(pages)} aria-label="Last page"><span className="hidden sm:inline">Last</span><ChevronsRight className="h-4 w-4" /></button>
        </div>
      </div>
      {openBill ? <BillDetailDrawer billId={openBill} onClose={() => setOpenBill(null)} /> : null}
    </section>
  );
}
