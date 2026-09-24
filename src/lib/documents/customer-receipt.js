import { formatCurrency } from '../currency.js';
import { getReceiptBranding } from './receipt-branding.js';

export function paymentLabel(method) {
  return { cash: 'Cash', card: 'Card', online: 'Online QR', credit: 'Customer Credit', split: 'Split' }[method] || method || '-';
}

function qrTypeLabel(type) {
  return { ESEWA_PHONEPAY: 'Esewa / PhonePay', BANK: 'Bank QR' }[type] || '';
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function paymentBreakdownRows(bill) {
  if (bill.payment_method !== 'split') {
    if (bill.payment_method === 'cash' && Number(bill.amount_paid || 0) > 0) {
      const change = Math.max(0, Number(bill.amount_paid || 0) - Number(bill.grand_total || 0));
      return `<tr><td>Cash received</td><td class="right">${formatCurrency(bill.amount_paid || 0)}</td></tr>${change > 0 ? `<tr><td>Change</td><td class="right">${formatCurrency(change)}</td></tr>` : ''}`;
    }
    if (bill.payment_method === 'online') return `<tr><td>QR type</td><td class="right">${qrTypeLabel(bill.qr_type) || 'Not recorded'}</td></tr>`;
    return '';
  }
  return `<tr><td>Cash paid</td><td class="right">${formatCurrency(bill.cash_amount || 0)}</td></tr><tr><td>QR paid</td><td class="right">${formatCurrency(bill.qr_amount || 0)}</td></tr>${Number(bill.credit_amount || 0) > 0 ? `<tr><td>Customer credit</td><td class="right">${formatCurrency(bill.credit_amount)}</td></tr>` : ''}<tr><td>QR type</td><td class="right">${qrTypeLabel(bill.qr_type)}</td></tr>`;
}

/**
 * Compact Review & Rewards block: the permanent salon QR (+ short URL for 58 mm printers that
 * print QR codes poorly), the customer's card progress when the bill has a customer, or the
 * one-time reward code for a walk-in bill. Omitted entirely when there is nothing to show.
 */
function reviewRewardsSection(bill, salon, compact) {
  const origin = String(salon.site_origin || '').replace(/\/$/, '');
  const host = origin.replace(/^https?:\/\//, '');
  const qr = bill.review_rewards_qr && origin;
  const progress = (bill.loyalty_progress || []).map((p) => (p.available > 0
    ? `<div><strong>${escapeHtml(p.name)}: ${escapeHtml(p.rewardLabel)} READY</strong></div>`
    : `<div>${escapeHtml(p.name)}: ${p.progress} / ${p.requiredVisits}</div><div class="muted">${p.remaining} more until ${escapeHtml(p.rewardLabel)}</div>`)).join('');
  const code = bill.loyalty_claim_code
    ? `<div style="margin-top:4px">Reward code: <strong style="letter-spacing:.2em">${escapeHtml(bill.loyalty_claim_code)}</strong></div><div class="muted">Enter it${host ? ` at ${escapeHtml(host)}/review` : ''} to add this visit to your card.</div>`
    : '';
  if (!qr && !code && !progress) return '';
  const size = compact ? '26mm' : '32mm';
  return `<hr class="divider" /><div style="text-align:center;break-inside:avoid;page-break-inside:avoid"><div><strong>REVIEW &amp; REWARDS</strong></div>${qr ? `<div class="muted">Scan to review your visit${progress || code ? ' and check your rewards' : ''}.</div><img src="${escapeHtml(origin)}/api/public/qr" alt="" style="width:${size};height:${size};display:block;margin:4px auto" /><div class="muted">${escapeHtml(host)}/review</div>` : ''}${progress}${code}</div>`;
}

export function buildCustomerReceiptHtml(billData, settings = {}) {
  const bill = billData.bill;
  const salon = { ...settings, ...(bill.document_snapshot || settings) };
  const paper = salon.receipt_paper_size === '58' ? 58 : 80;
  const compact = paper === 58;
  const contentWidth = paper === 58 ? 54 : 76;
  // 58 mm rolls print ~48 mm and 80 mm rolls ~72 mm; side padding keeps text inside that area.
  const sidePadding = paper === 58 ? '3mm' : '8px';
  const branding = getReceiptBranding(paper);
  const show = (key) => salon[key] !== false && salon[key] !== 'false';
  const visibleItems = (billData.items || []).filter((item) => item.item_type === 'product' ? show('receipt_show_products') : show('receipt_show_services'));
  const itemRows = visibleItems.map((item) => compact
    ? `<tr><td><div class="item-name">${escapeHtml(item.name)}</div><div class="item-meta">${Number(item.quantity || 1)} × ${formatCurrency(item.unit_price ?? (Number(item.subtotal || 0) / Number(item.quantity || 1)))}</div>${show('receipt_show_stylist') && item.staff_name_snapshot ? `<div class="item-meta">Stylist: ${escapeHtml(item.staff_name_snapshot)}</div>` : ''}</td><td class="right">${formatCurrency(item.subtotal)}</td></tr>`
    : `<tr><td><div class="item-name">${escapeHtml(item.name)}</div>${show('receipt_show_stylist') && item.staff_name_snapshot ? `<div class="item-meta">Stylist: ${escapeHtml(item.staff_name_snapshot)}</div>` : ''}</td><td class="right">${Number(item.quantity || 1)}</td><td class="right">${formatCurrency(item.unit_price ?? (Number(item.subtotal || 0) / Number(item.quantity || 1)))}</td><td class="right">${formatCurrency(item.subtotal)}</td></tr>`).join('');
  const itemHeader = compact
    ? `<tr><th style="width:64%">${escapeHtml(salon.receipt_item_label || 'Item')} / ${escapeHtml(salon.receipt_quantity_label || 'Qty')}</th><th class="right" style="width:36%">${escapeHtml(salon.receipt_amount_label || 'Amount')}</th></tr>`
    : `<tr><th>${escapeHtml(salon.receipt_item_label || 'Item')}</th><th class="right">${escapeHtml(salon.receipt_quantity_label || 'Qty')}</th><th class="right">${escapeHtml(salon.receipt_rate_label || 'Rate')}</th><th class="right">${escapeHtml(salon.receipt_amount_label || 'Amount')}</th></tr>`;
  // discount_amount includes any loyalty reward; print the reward on its own line.
  const loyaltyDiscount = Number(bill.loyalty_discount || 0);
  const manualDiscount = Number(bill.discount_amount || 0) - loyaltyDiscount;
  const discountRow = (show('receipt_show_discount') && manualDiscount > 0.004 ? `<tr><td>Discount</td><td class="right">-${formatCurrency(manualDiscount)}</td></tr>` : '')
    + (loyaltyDiscount > 0 ? `<tr><td>Loyalty reward${bill.loyalty_reward_label ? ` (${escapeHtml(bill.loyalty_reward_label)})` : ''}</td><td class="right">-${formatCurrency(loyaltyDiscount)}</td></tr>` : '');
  const rewardsSection = reviewRewardsSection(bill, salon, compact);
  const taxRow = show('receipt_show_tax') && Number(bill.tax || 0) > 0 ? `<tr><td>Tax${bill.tax_percent ? ` (${bill.tax_percent}%)` : ''}</td><td class="right">${formatCurrency(bill.tax)}</td></tr>` : '';
  const serviceChargeRow = Number(bill.service_charge || 0) > 0 ? `<tr><td>Service charge</td><td class="right">${formatCurrency(bill.service_charge)}</td></tr>` : '';
  const billDate = new Date(bill.transaction_time || bill.created_at || Date.now()).toLocaleString();

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(bill.bill_number)}</title><style>
@page{size:${paper}mm auto;margin:0}*{box-sizing:border-box}html,body{min-height:0;height:auto}body{font-family:"Courier New",Courier,monospace;width:100%;max-width:${contentWidth}mm;margin:0 auto;padding:10px ${sidePadding} 4px;color:#111;font-size:12px;line-height:1.35;background:#fff;overflow:visible}.brand{text-align:center;margin-bottom:8px}.brand h1{margin:0;font-size:18px;letter-spacing:.04em;text-transform:uppercase;overflow-wrap:anywhere}.muted{color:#444;font-size:11px}.divider{border:0;border-top:1px dashed #222;margin:8px 0}.meta,.customer{text-align:center}.customer{margin-top:4px;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{padding:3px 2px;vertical-align:top}th{border-bottom:1px solid #222;font-size:10px;text-align:left}.right{text-align:right;white-space:nowrap}.items-table{table-layout:fixed}.items-table th:nth-child(1){width:${paper === 58 ? 32 : 46}%}.items-table th:nth-child(2){width:${paper === 58 ? 10 : 12}%}.items-table th:nth-child(3){width:${paper === 58 ? 29 : 20}%}.items-table th:nth-child(4){width:${paper === 58 ? 29 : 22}%}.items-table .right{font-size:9px}.item-name{font-weight:bold;overflow-wrap:anywhere}.item-meta{color:#555;font-size:10px;overflow-wrap:anywhere}.totals td{padding-top:4px}${compact ? '.totals td.right{white-space:normal;overflow-wrap:anywhere}' : ''}.grand td{border-top:1px dashed #222;padding-top:6px;font-size:14px;font-weight:bold}.token{text-align:center;margin:4px 0 0;font-weight:bold}.receipt-footer{text-align:center;font-size:11px}.receipt-imprint{text-align:center;margin-top:6px;font-family:Arial,"Liberation Sans",Helvetica,sans-serif;line-height:1.2;white-space:nowrap;break-inside:avoid;page-break-inside:avoid}.receipt-imprint__thanks{font-size:${compact ? 10 : 11}px;padding-bottom:3px;border-bottom:1px solid #111}.receipt-imprint__tagline{margin-top:3px;font-size:${compact ? 8.5 : 10}px;font-weight:700;letter-spacing:.02em}.receipt-imprint__verticals{font-size:${compact ? 8 : 9}px}.receipt-imprint__verticals strong{font-weight:700;letter-spacing:.03em}@media print{html,body{min-height:0!important;height:auto!important;overflow:visible!important}.receipt-imprint{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><div class="brand">${show('receipt_show_salon_name') ? `<h1>${escapeHtml(salon.salon_name || 'The Hair Cut')}</h1>` : ''}<div>${escapeHtml(salon.receipt_title || 'Customer Receipt')}</div>${show('receipt_show_address') && salon.salon_address ? `<div class="muted">${escapeHtml(salon.salon_address)}</div>` : ''}${show('receipt_show_phone') && salon.salon_phone ? `<div class="muted">Tel: ${escapeHtml(salon.salon_phone)}</div>` : ''}${show('receipt_show_address') && salon.salon_email ? `<div class="muted">${escapeHtml(salon.salon_email)}</div>` : ''}${show('receipt_show_pan_vat') && salon.vat_number ? `<div class="muted">VAT/PAN: ${escapeHtml(salon.vat_number)}</div>` : ''}</div><hr class="divider" /><div class="meta">${show('receipt_show_invoice_number') ? `<div><strong>${escapeHtml(salon.receipt_invoice_label || 'Invoice')}: ${escapeHtml(bill.bill_number)}</strong></div>` : ''}${show('receipt_show_date_time') ? `<div class="muted">${escapeHtml(billDate)}</div>` : ''}</div>${show('receipt_show_customer') ? `<div class="customer">${escapeHtml(bill.customer_name || 'Walk-in Customer')}</div>${bill.customer_phone ? `<div class="meta">${escapeHtml(bill.customer_phone)}</div>` : ''}` : ''}${bill.token_number ? `<div class="token">Token #${escapeHtml(bill.token_number)}</div>` : ''}${show('receipt_show_cashier') && bill.cashier_name ? `<div class="muted meta">Cashier: ${escapeHtml(bill.cashier_name)}</div>` : ''}<hr class="divider" /><table class="items-table"><thead>${itemHeader}</thead><tbody>${itemRows}</tbody></table><hr class="divider" /><table class="totals"><tr><td>Subtotal</td><td class="right">${formatCurrency(bill.subtotal)}</td></tr>${discountRow}${taxRow}${serviceChargeRow}<tr class="grand"><td>TOTAL</td><td class="right">${formatCurrency(bill.grand_total)}</td></tr>${show('receipt_show_payment') ? `<tr><td>Payment</td><td class="right">${Number(bill.grand_total || 0) === 0 && loyaltyDiscount > 0 ? 'Loyalty reward' : escapeHtml(paymentLabel(bill.payment_method))}</td></tr>${paymentBreakdownRows(bill)}` : ''}</table>${rewardsSection}${show('receipt_show_notes') && bill.notes ? `<hr class="divider" /><div class="muted meta">Note: ${escapeHtml(bill.notes)}</div>` : ''}${show('receipt_show_aadhar_branding') ? `<footer class="receipt-imprint" aria-label="Aadhar POS receipt imprint"><div class="receipt-imprint__thanks">${branding.thanks}</div><div class="receipt-imprint__tagline">${branding.tagline}</div><div class="receipt-imprint__verticals">${branding.verticals.length ? `${branding.verticals.join(' • ')} | ` : ''}<strong>${branding.wordmark}</strong>${branding.contact ? ` · ${escapeHtml(branding.contact)}` : ''}</div></footer>` : `<hr class="divider" /><div class="receipt-footer">${escapeHtml(salon.receipt_footer || 'Thank you for visiting. Please visit again.')}</div>`}</body></html>`;
}
