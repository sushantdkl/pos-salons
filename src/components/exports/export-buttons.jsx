'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { downloadCsv } from '@/lib/exports/table-export';

/**
 * Excel (branded colours) + CSV from one sheet spec. Pass `sheets`, or `getSheets` when the
 * rows must be fetched first (e.g. every page of a paginated report).
 */
export function ExportButtons({ filename, title, subtitle, sheets, getSheets, disabled = false, compact = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const run = async (kind) => {
    setBusy(kind);
    setError('');
    try {
      const resolved = getSheets ? await getSheets() : sheets;
      if (!resolved?.length) return;
      if (kind === 'xlsx') {
        const { exportXlsx } = await import('@/lib/exports/xlsx');
        await exportXlsx({ filename, title, subtitle, sheets: resolved });
      } else {
        downloadCsv(filename, resolved);
      }
    } catch (exportError) {
      setError(exportError.message || 'Export failed. Try again.');
    } finally {
      setBusy('');
    }
  };

  const size = compact ? 'min-h-9 px-3 text-xs' : 'min-h-10 px-3.5 text-sm';
  const icon = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div className="print-hide inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => run('xlsx')}
        disabled={disabled || Boolean(busy)}
        title="Excel workbook with the report colours"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-emerald-700 font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45 ${size}`}
      >
        {busy === 'xlsx' ? <Loader2 className={`${icon} animate-spin`} /> : <FileSpreadsheet className={icon} />}
        Excel
      </button>
      <button
        type="button"
        onClick={() => run('csv')}
        disabled={disabled || Boolean(busy)}
        title="Plain CSV (no colours — use Excel for the coloured version)"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 ${size}`}
      >
        {busy === 'csv' ? <Loader2 className={`${icon} animate-spin`} /> : <FileText className={icon} />}
        CSV
      </button>
      {error ? <span role="alert" className="text-xs font-semibold text-rose-700">{error}</span> : null}
    </div>
  );
}
