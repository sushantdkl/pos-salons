/**
 * One column spec → both exports. A "sheet" is { name, columns, rows, totals?, note? } where
 * columns are { header, key, type, tone, value? } (see xlsx.js). CSV gets the same columns and
 * formatted numbers; the .xlsx gets the brand colours.
 */
import { arrayRows, inferColumns } from './xlsx';

/** Quote for CSV and neutralise spreadsheet formulas (=, +, -, @) in text cells. */
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvValue(column, row) {
  const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
  if (raw === null || raw === undefined) return '';
  if (['money', 'decimal'].includes(column.type) && raw !== '' && Number.isFinite(Number(raw))) return Number(raw).toFixed(2);
  return raw;
}

export function sheetsToCsv(sheets) {
  return sheets.map((sheet) => {
    const lines = [];
    if (sheets.length > 1) lines.push(csvCell(sheet.name));
    lines.push(sheet.columns.map((column) => csvCell(column.header)).join(','));
    for (const row of sheet.rows) lines.push(sheet.columns.map((column) => csvCell(csvValue(column, row))).join(','));
    if (sheet.totals) lines.push(sheet.columns.map((column) => csvCell(sheet.totals[column.key] ?? '')).join(','));
    return lines.join('\n');
  }).join('\n\n');
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(filename).replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadCsv(filename, sheets) {
  // BOM so Excel opens Nepali / Devanagari text correctly.
  saveBlob(new Blob([`﻿${sheetsToCsv(sheets)}`], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

/** Plain header + array rows (as many older screens hold them) → a typed, toned sheet. */
export function tableSheet(name, headers, rows, overrides = {}) {
  const columns = inferColumns(headers).map((column) => ({ ...column, ...(overrides[column.header] || {}) }));
  return { name, columns, rows: arrayRows(rows) };
}
