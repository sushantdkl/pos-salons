/**
 * Branded Excel export — the same colours the reports use on screen.
 *
 * CSV is plain text and cannot carry colour, so coloured exports are real .xlsx workbooks:
 * a dark brand band with the title and period, header cells tinted by the column's meaning
 * (money in = emerald, money out = rose, cash = amber, online = sky, ledger = indigo, HR = violet,
 * services = teal, CRM = pink), zebra rows, Rs number formats, coloured status cells, a bold
 * totals row, frozen header and filters. exceljs loads only when an export is requested.
 *
 *   await exportXlsx({
 *     filename: 'Sales 2026-09',
 *     title: 'Sales & Invoices', subtitle: '1 Sep 2026 – 30 Sep 2026',
 *     sheets: [{ name: 'Sales', columns: [{ header: 'Bill', key: 'bill' }, { header: 'Total', key: 'total', type: 'money', tone: 'inflow' }], rows, totals: { bill: 'Total', total: 12345 } }],
 *   });
 */

// Same palette as components/erp/tokens.js (hex without '#', ARGB for Excel).
export const TONE_HEX = {
  inflow: { strong: '047857', soft: 'D1FAE5' },
  outflow: { strong: 'BE123C', soft: 'FFE4E6' },
  cash: { strong: 'B45309', soft: 'FEF3C7' },
  online: { strong: '0369A1', soft: 'E0F2FE' },
  ledger: { strong: '4338CA', soft: 'E0E7FF' },
  hrm: { strong: '6D28D9', soft: 'EDE9FE' },
  ops: { strong: '0F766E', soft: 'CCFBF1' },
  crm: { strong: 'BE185D', soft: 'FCE7F3' },
  neutral: { strong: '44403C', soft: 'F5F5F4' },
};
const BRAND = { dark: '171411', gold: 'D7B56D', muted: '78716C', stripe: 'FAFAF9', border: 'E7E5E4' };

// Status words → tone, so PAID shows green, VOID red, PENDING amber … in any column typed 'status'.
const STATUS_TONE = {
  paid: 'inflow', active: 'inflow', approved: 'inflow', present: 'inflow', published: 'inflow', received: 'inflow', completed: 'inflow', allowed: 'inflow',
  void: 'outflow', voided: 'outflow', cancelled: 'outflow', rejected: 'outflow', absent: 'outflow', missing_punch: 'outflow', no_show: 'outflow', blocked: 'outflow',
  pending: 'cash', partial: 'cash', late: 'cash', credit: 'cash', half_day: 'cash', open: 'cash',
  private: 'online', on_leave: 'online', confirmed: 'online', online: 'online',
  holiday: 'ledger', off_day: 'neutral', archived: 'neutral',
};

const argb = (hex) => `FF${hex}`;
const fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const FORMATS = { money: '"Rs "#,##0.00;[Red]-"Rs "#,##0.00', number: '#,##0', decimal: '#,##0.00', percent: '0.0"%"' };

function cellValue(column, row) {
  const raw = typeof column.value === 'function' ? column.value(row) : row[column.key];
  if (raw === null || raw === undefined || raw === '') return null;
  if (['money', 'number', 'decimal', 'percent'].includes(column.type)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : String(raw);
  }
  if (column.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(raw))) return new Date(`${String(raw).slice(0, 10)}T00:00:00Z`);
  return String(raw);
}

function addSheet(workbook, { name, columns, rows, totals, title, subtitle, note }) {
  const sheet = workbook.addWorksheet(String(name || 'Report').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: columns.length > 6 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const width = Math.max(columns.length, 2);

  // Brand band: salon name + report title, then period / generated line.
  sheet.mergeCells(1, 1, 1, width);
  const head = sheet.getCell(1, 1);
  head.value = `THE HAIR CUT  ·  ${title || name}`;
  head.font = { name: 'Calibri', size: 15, bold: true, color: { argb: argb('FFFFFF') } };
  head.fill = fill(BRAND.dark);
  head.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(1).height = 28;
  sheet.mergeCells(2, 1, 2, width);
  const sub = sheet.getCell(2, 1);
  const generated = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  sub.value = [subtitle, `Generated ${generated} (Nepal time)`].filter(Boolean).join('   ·   ');
  sub.font = { size: 10, color: { argb: argb(BRAND.gold) }, bold: true };
  sub.fill = fill(BRAND.dark);
  sub.alignment = { indent: 1 };
  sheet.getRow(3).height = 6;

  // Header row, tinted by each column's tone.
  const header = sheet.getRow(4);
  columns.forEach((column, index) => {
    const tone = TONE_HEX[column.tone] || TONE_HEX.neutral;
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: argb(tone.strong) }, size: 10 };
    cell.fill = fill(tone.soft);
    cell.alignment = { vertical: 'middle', horizontal: ['money', 'number', 'decimal', 'percent'].includes(column.type) ? 'right' : 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: argb(tone.strong) } } };
  });
  header.height = 30;

  // Body.
  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(5 + rowIndex);
    columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      const value = cellValue(column, row);
      cell.value = value;
      if (FORMATS[column.type]) cell.numFmt = FORMATS[column.type];
      if (column.type === 'date') cell.numFmt = 'dd mmm yyyy';
      if (rowIndex % 2 === 1) cell.fill = fill(BRAND.stripe);
      cell.border = { bottom: { style: 'hair', color: { argb: argb(BRAND.border) } } };
      if (column.tone && ['money', 'number', 'decimal', 'percent'].includes(column.type) && typeof value === 'number' && value !== 0) {
        cell.font = { color: { argb: argb((TONE_HEX[column.tone] || TONE_HEX.neutral).strong) } };
      }
      if (column.type === 'status' && value) {
        const tone = TONE_HEX[STATUS_TONE[String(value).toLowerCase().replace(/\s+/g, '_')]] || null;
        if (tone) {
          cell.fill = fill(tone.soft);
          cell.font = { bold: true, color: { argb: argb(tone.strong) } };
        }
      }
      if (column.bold) cell.font = { ...(cell.font || {}), bold: true };
    });
  });

  // Totals.
  if (totals) {
    const totalRow = sheet.getRow(5 + rows.length);
    columns.forEach((column, index) => {
      const cell = totalRow.getCell(index + 1);
      const value = totals[column.key];
      cell.value = value === undefined ? null : value;
      if (FORMATS[column.type] && typeof value === 'number') cell.numFmt = FORMATS[column.type];
      cell.font = { bold: true, color: { argb: argb(BRAND.dark) } };
      cell.fill = fill('EDEAE4');
      cell.border = { top: { style: 'medium', color: { argb: argb(BRAND.dark) } } };
    });
  }
  if (note) {
    const noteRow = sheet.getRow(6 + rows.length + (totals ? 1 : 0));
    noteRow.getCell(1).value = note;
    noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: argb(BRAND.muted) } };
  }

  // Filters + sensible widths.
  if (rows.length) sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: columns.length } };
  // Wide enough for the header PLUS the filter button (~4 chars), and for the formatted value
  // ("Rs 12,05,150.00" is longer than the raw number). Minimums per type keep sheets readable.
  const MIN_WIDTH = { money: 18, decimal: 14, number: 11, percent: 10, status: 14, date: 14 };
  columns.forEach((column, index) => {
    const header = String(column.header).length + 5;
    const longest = Math.max(0, ...rows.slice(0, 500).map((row) => {
      const value = cellValue(column, row);
      if (typeof value === 'number') return (FORMATS[column.type] ? `Rs ${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : String(value)).length;
      return String(value ?? '').length;
    })) + 3;
    const totalLength = totals && totals[column.key] !== undefined ? String(totals[column.key]).length + 6 : 0;
    const auto = Math.max(header, longest, totalLength, MIN_WIDTH[column.type] || 12);
    sheet.getColumn(index + 1).width = Math.min(column.width ? Math.max(column.width, auto) : auto, 70);
  });
  return sheet;
}

export async function exportXlsx({ filename, title, subtitle, sheets }) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'The Hair Cut POS';
  workbook.created = new Date();
  for (const sheet of sheets) addSheet(workbook, { title, subtitle, ...sheet });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${String(filename || title || 'report').replace(/[\\/:*?"<>|]/g, '-')}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Guess column types/tones from header words when a page only has plain header + row arrays. */
export function inferColumns(headers) {
  return headers.map((header, index) => {
    const h = String(header).toLowerCase();
    let type = 'text';
    let tone;
    if (/(amount|total|sales|revenue|spend|paid|collected|cash|online|price|cost|value|discount|refund|expense|balance|due|payable|owed|credit|commission|salary|bonus|deduction|profit|received|net|gross|tax)/.test(h) && !/(method|type|count|bills|visits|date|days)/.test(h)) type = 'money';
    else if (/(rate|share|%)/.test(h)) type = 'percent';
    else if (/(count|bills|visits|qty|quantity|days|minutes|services|invoices|tokens|customers|number of)/.test(h) && !/(bill #|bill no|invoice no)/.test(h)) type = 'number';
    else if (/status|state/.test(h)) type = 'status';
    else if (/^date$|date|day$|when/.test(h)) type = 'text';
    if (type === 'money') {
      if (/(refund|expense|discount|void|deduction|cost|payable|owed|due|out)/.test(h)) tone = 'outflow';
      else if (/cash/.test(h)) tone = 'cash';
      else if (/(online|qr|bank)/.test(h)) tone = 'online';
      else if (/(balance|ledger)/.test(h)) tone = 'ledger';
      else tone = 'inflow';
    }
    return { header, key: String(index), type, tone };
  });
}

/** Rows given as arrays → objects keyed by column index (for inferColumns). */
export function arrayRows(rows) {
  return rows.map((row) => Object.fromEntries(row.map((value, index) => [String(index), value])));
}
