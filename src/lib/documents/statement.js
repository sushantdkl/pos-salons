/**
 * Printed credit statement (customer or supplier) — the layout and wording come from
 * Printer & Documents (statement_* settings). A4 is the full-page ledger; 80 / 58 mm is a
 * compact thermal version of the same content.
 *
 *   buildStatementHtml({ view, kind, mode, settings, fmtDate, printedAt })
 *     view: { name, phone, owed, open: [{ date, label, total, due }], statement: [{ date, detail, added, removed, balance }] }
 *     mode: 'all' (every entry with a running balance) | 'due' (only what is still owed)
 */

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const on = (settings, key) => settings[key] !== false && settings[key] !== 'false';
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
export const statementMoney = (value) => `Rs ${num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (value) => num(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function buildStatementHtml({ view, kind = 'customer', mode = 'all', settings = {}, fmtDate = (value) => String(value || ''), printedAt = '' }) {
  const paper = ['80', '58'].includes(String(settings.statement_paper_size)) ? String(settings.statement_paper_size) : 'a4';
  const thermal = paper !== 'a4';
  const title = kind === 'supplier' ? settings.statement_supplier_title || 'SUPPLIER CREDIT STATEMENT' : settings.statement_customer_title || 'CUSTOMER CREDIT STATEMENT';
  const labels = {
    date: settings.statement_date_label || 'Date / Note',
    debit: settings.statement_debit_label || 'Debit',
    credit: settings.statement_credit_label || 'Credit',
    balance: settings.statement_balance_label || 'Balance',
  };
  const salonName = settings.salon_name || 'The Hair Cut';
  const pan = settings.pan_number || settings.vat_number || '';
  const party = kind === 'supplier' ? 'Supplier' : 'Customer';
  const scope = mode === 'due' ? 'Outstanding items only' : 'All transactions';

  const rows = mode === 'due'
    ? (view.open || []).map((row) => (thermal
      ? `<tr><td><div class="b">${esc(row.label)}</div><div class="m">${esc(fmtDate(row.date))} · total ${plain(row.total)}</div></td><td class="r b">${plain(row.due)}</td></tr>`
      : `<tr><td class="nw">${esc(fmtDate(row.date))}</td><td>${esc(row.label)}</td><td class="r">${plain(row.total)}</td><td class="r b due">${plain(row.due)}</td></tr>`)).join('')
    : (view.statement || []).map((row) => {
      const debit = num(row.added) ? plain(row.added) : '—';
      const credit = num(row.removed) ? plain(row.removed) : '—';
      const balance = row.balance === null || row.balance === undefined ? '—' : plain(row.balance);
      return thermal
        ? `<tr><td colspan="3"><div class="b">${esc(fmtDate(row.date))}</div><div class="m">${esc(row.detail)}</div></td></tr><tr class="sub"><td class="r">${debit}</td><td class="r">${credit}</td><td class="r b">${balance}</td></tr>`
        : `<tr><td><div class="nw b">${esc(fmtDate(row.date))}</div><div class="m">${esc(row.detail)}</div></td><td class="r">${debit}</td><td class="r">${credit}</td><td class="r b">${balance}</td></tr>`;
    }).join('');

  const head = mode === 'due'
    ? (thermal ? '<tr><th>Bill / invoice</th><th class="r">Due</th></tr>' : '<tr><th style="width:17%">Date</th><th>Bill / invoice</th><th class="r" style="width:18%">Total</th><th class="r" style="width:18%">Still due</th></tr>')
    : (thermal
      ? `<tr><th colspan="3">${esc(labels.date)}</th></tr><tr class="sub"><th class="r">${esc(labels.debit)}</th><th class="r">${esc(labels.credit)}</th><th class="r">${esc(labels.balance)}</th></tr>`
      : `<tr><th>${esc(labels.date)}</th><th class="r" style="width:16%">${esc(labels.debit)}</th><th class="r" style="width:16%">${esc(labels.credit)}</th><th class="r" style="width:17%">${esc(labels.balance)}</th></tr>`);
  const cols = mode === 'due' ? (thermal ? 2 : 4) : (thermal ? 3 : 4);
  const empty = `<tr><td colspan="${cols}" class="empty">Nothing to show.</td></tr>`;

  const letterhead = `<header class="lh">
      <div class="salon">${esc(salonName)}</div>
      ${on(settings, 'statement_show_address') && settings.salon_address ? `<div class="m">${esc(settings.salon_address)}</div>` : ''}
      <div class="m">${[settings.salon_phone ? `Tel ${esc(settings.salon_phone)}` : '', on(settings, 'statement_show_pan') && pan ? `PAN ${esc(pan)}` : ''].filter(Boolean).join(' · ')}</div>
    </header>
    <div class="band"><div class="title">${esc(title)}</div>${on(settings, 'statement_show_not_tax_invoice') ? '<div class="ntx">NOT A TAX INVOICE</div>' : ''}</div>`;

  const partyBlock = `<section class="party">
      <div><div class="k">${party}</div><div class="v">${esc(view.name)}</div>${on(settings, 'statement_show_phone') && view.phone ? `<div class="m">${esc(view.phone)}</div>` : ''}</div>
      <div class="rt"><div class="k">${scope}</div>${on(settings, 'statement_show_printed_at') && printedAt ? `<div class="m">Printed ${esc(printedAt)}</div>` : ''}</div>
    </section>
    <div class="owed"><span>${kind === 'supplier' ? 'Total owed to supplier' : 'Total outstanding'}</span><b>${statementMoney(view.owed)}</b></div>`;

  const css = thermal
    ? `@page{size:${paper}mm auto;margin:0}*{box-sizing:border-box}body{font-family:"Courier New",Courier,monospace;color:#111;margin:0 auto;padding:10px ${paper === '58' ? '3mm' : '8px'} 8px;max-width:${paper === '58' ? 54 : 76}mm;font-size:${paper === '58' ? 10.5 : 11.5}px;line-height:1.35}
       .lh{text-align:center}.salon{font-size:${paper === '58' ? 14 : 16}px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}.m{color:#333;font-size:.9em}
       .band{text-align:center;border-top:1px dashed #111;border-bottom:1px dashed #111;margin:8px 0;padding:4px 0}.title{font-weight:700}.ntx{font-size:.8em;letter-spacing:.06em}
       .party{display:flex;justify-content:space-between;gap:6px}.rt{text-align:right}.k{font-size:.8em;text-transform:uppercase;color:#444}.v{font-weight:700}
       .owed{display:flex;justify-content:space-between;border:1px solid #111;padding:4px 6px;margin:8px 0}.owed b{font-size:1.1em}
       table{width:100%;border-collapse:collapse}th{text-align:left;font-size:.85em;border-bottom:1px solid #111;padding:2px 0}td{padding:2px 0;vertical-align:top}
       tr.sub td,tr.sub th{border-bottom:1px dotted #999;padding-bottom:4px}.r{text-align:right;white-space:nowrap}.b{font-weight:700}.empty{text-align:center;padding:8px 0;color:#555}
       tfoot td{border-top:1px dashed #111;padding-top:4px;font-weight:700}.foot{text-align:center;margin-top:10px;border-top:1px dashed #111;padding-top:6px}`
    : `@page{size:A4;margin:14mm 14mm 16mm}*{box-sizing:border-box}body{font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;color:#1c1917;margin:0;font-size:12px}
       .lh{text-align:center;padding-bottom:10px}.salon{font-size:22px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.m{color:#57534e;font-size:11.5px;margin-top:2px}
       .band{background:#1c1917;color:#fff;text-align:center;padding:8px 0;border-radius:6px;margin:4px 0 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.title{font-weight:800;letter-spacing:.14em;font-size:14px}.ntx{font-size:9.5px;letter-spacing:.2em;color:#d6c7a1;margin-top:2px}
       .party{display:flex;justify-content:space-between;gap:16px;border:1px solid #e7e5e4;border-radius:8px;padding:10px 14px}.rt{text-align:right}.k{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#78716c}.v{font-size:15px;font-weight:700;margin-top:2px}
       .owed{display:flex;justify-content:space-between;align-items:center;margin:12px 0 16px;padding:10px 14px;border-radius:8px;background:#fff1f2;border:1px solid #fecdd3;-webkit-print-color-adjust:exact;print-color-adjust:exact}.owed span{font-weight:600;color:#9f1239}.owed b{font-size:20px;color:#be123c}
       table{width:100%;border-collapse:collapse}thead{display:table-header-group}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#44403c;border-bottom:2px solid #1c1917;padding:7px 8px}
       td{border-bottom:1px solid #e7e5e4;padding:7px 8px;vertical-align:top}tr{break-inside:avoid;page-break-inside:avoid}tbody tr:nth-child(even) td{background:#fafaf9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
       .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.nw{white-space:nowrap}.b{font-weight:700}.due{color:#be123c}.empty{text-align:center;color:#78716c;padding:18px}
       tfoot td{border-top:2px solid #1c1917;border-bottom:0;font-weight:800;font-size:13px;background:#fff}.foot{margin-top:22px;text-align:center;color:#44403c;font-size:12px;border-top:1px solid #e7e5e4;padding-top:10px}
       .sign{display:flex;justify-content:space-between;margin-top:46px;font-size:11px;color:#57534e}.sign div{border-top:1px solid #a8a29e;padding-top:4px;width:38%;text-align:center}
       @media screen{body{padding:14mm}}`;

  const footer = `${settings.statement_footer ? `<p class="foot">${esc(settings.statement_footer)}</p>` : ''}${thermal ? '' : `<div class="sign"><div>Prepared by</div><div>${party} acknowledgement</div></div>`}`;

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(view.name)} — ${esc(title.toLowerCase())}</title><style>${css}</style></head><body>
    ${letterhead}
    ${partyBlock}
    <table><thead>${head}</thead><tbody>${rows || empty}</tbody>
      <tfoot><tr><td colspan="${cols - 1}">${mode === 'due' ? 'Total still due' : 'Balance now'}</td><td class="r">${statementMoney(view.owed)}</td></tr></tfoot>
    </table>
    ${footer}
  </body></html>`;
}
