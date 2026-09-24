/**
 * Printed Review & Rewards QR sheet — the card on the counter / mirror that customers scan to
 * leave a review and check their rewards. Layout and wording come from Printer & Documents
 * (qr_* settings). The QR itself is the one permanent salon QR (/api/public/qr → /review).
 *
 *   buildReviewQrSheetHtml(settings, { qrSrc, reviewUrl, autoPrint })
 */

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const on = (settings, key) => settings[key] !== false && settings[key] !== 'false';

export const QR_SHEETS = {
  a4: { page: 'A4', maxQr: 150, scale: 1 },
  a5: { page: 'A5', maxQr: 105, scale: 0.72 },
  a6: { page: 'A6', maxQr: 72, scale: 0.5 },
};

/** QR edge in mm for the chosen sheet — never larger than the sheet allows. */
export function qrSizeFor(settings = {}) {
  const sheet = QR_SHEETS[String(settings.qr_sheet_size)] || QR_SHEETS.a4;
  const wanted = Number(settings.qr_print_size_mm) || 110;
  return Math.min(wanted, sheet.maxQr);
}

export function buildReviewQrSheetHtml(settings = {}, { qrSrc, reviewUrl = '', autoPrint = true } = {}) {
  const sheet = QR_SHEETS[String(settings.qr_sheet_size)] || QR_SHEETS.a4;
  const s = sheet.scale;
  const qr = qrSizeFor(settings);
  const border = on(settings, 'qr_show_border');
  const pt = (value) => `${Math.round(value * s * 10) / 10}pt`;
  const printScript = autoPrint ? ' onload="setTimeout(function(){window.print()},250)"' : '';

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(settings.qr_title || 'Review & Rewards')} — QR</title><style>
    @page{size:${sheet.page};margin:${Math.round(10 * s + 4)}mm}*{box-sizing:border-box}
    html,body{margin:0;background:#fff;color:#161412;font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .card{display:flex;flex-direction:column;align-items:center;text-align:center;padding:${Math.round(14 * s + 4)}mm ${Math.round(12 * s + 3)}mm ${Math.round(12 * s + 3)}mm;${border ? `border:${s < 0.7 ? 1.5 : 2.5}px solid #161412;border-radius:${Math.round(8 * s + 2)}mm;` : ''}}
    .salon{font-size:${pt(13)};font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#8a6a2f}
    .rule{width:${Math.round(34 * s + 8)}mm;height:2px;background:#b08d4a;margin:${pt(10)} auto ${pt(14)}}
    h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:${pt(40)};line-height:1.05;letter-spacing:.02em;overflow-wrap:anywhere}
    .station{margin-top:${pt(8)};font-size:${pt(20)};font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .lead{margin:${pt(14)} 0 ${pt(4)};font-size:${pt(17)};color:#3f3a35}
    .qr{width:${qr}mm;height:${qr}mm;margin:${pt(14)} auto ${pt(8)};padding:${Math.max(2, Math.round(3 * s))}mm;border:1px solid #e7e2da;border-radius:${Math.round(4 * s + 1)}mm;background:#fff}
    .qr img{display:block;width:100%;height:100%}
    .url{font-size:${pt(11)};color:#57534e;letter-spacing:.02em;overflow-wrap:anywhere}
    .foot{margin-top:${pt(14)};font-size:${pt(14)};font-weight:700}
    @media screen{body{padding:${Math.round(10 * s + 4)}mm}}
  </style></head><body><div class="card">
    ${on(settings, 'qr_show_salon_name') ? `<div class="salon">${esc(settings.salon_name || 'The Hair Cut')}</div><div class="rule"></div>` : ''}
    <h1>${esc(settings.qr_title || 'LOVE YOUR LOOK?')}</h1>
    ${settings.qr_station_label ? `<div class="station">${esc(settings.qr_station_label)}</div>` : ''}
    ${settings.qr_instruction ? `<p class="lead">${esc(settings.qr_instruction)}</p>` : ''}
    <div class="qr"><img src="${esc(qrSrc)}" alt="Review &amp; Rewards QR code"${printScript} /></div>
    ${on(settings, 'qr_show_url') && reviewUrl ? `<div class="url">${esc(reviewUrl)}</div>` : ''}
    ${settings.qr_footer ? `<div class="foot">${esc(settings.qr_footer)}</div>` : ''}
  </div></body></html>`;
}
