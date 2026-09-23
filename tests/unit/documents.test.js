import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocumentSettings } from '../../src/lib/documents/settings.js';
import { getReceiptBranding } from '../../src/lib/documents/receipt-branding.js';
import { buildCustomerReceiptHtml } from '../../src/lib/documents/customer-receipt.js';

test('printer settings accept supported thermal widths and force Nepal timezone',()=>{
  assert.equal(normalizeDocumentSettings({receipt_paper_size:'58'}).receipt_paper_size,'58');
  const normalized=normalizeDocumentSettings({receipt_paper_size:'99',business_timezone:'UTC',calendar_system:'bs'});
  assert.equal(normalized.receipt_paper_size,'80'); assert.equal(normalized.business_timezone,'Asia/Kathmandu'); assert.equal(normalized.calendar_system,'BS');
});

test('Aadhar receipt imprint uses the stationery wording and never invents contact details', () => {
  const standard = getReceiptBranding('80', '');
  assert.equal(standard.thanks, 'Thank you for visiting');
  assert.equal(standard.tagline, 'YOUR BUSINESS. OUR BILLING.');
  assert.equal(standard.wordmark, 'AADHAR POS');
  assert.deepEqual([...standard.verticals], ['Restaurant', 'Retail', 'Salon', 'Cosmetics']);
  assert.equal(standard.contact, '');
  assert.deepEqual([...getReceiptBranding('58', '').verticals], ['Restaurant', 'Retail']);
});

test('customer receipt keeps transaction content and replaces the generic footer', () => {
  const html = buildCustomerReceiptHtml({
    bill: { bill_number: 'SALON-42', customer_name: 'Customer', subtotal: 1000, discount_amount: 100, tax: 117, tax_percent: 13, grand_total: 1017, payment_method: 'online', qr_type: 'BANK', notes: 'Handle with care' },
    items: [{ item_type: 'product', name: 'Extra long professional salon product name that must wrap safely', quantity: 2, unit_price: 500, subtotal: 1000 }],
  }, { receipt_paper_size: '58', receipt_footer: 'Legacy generic footer', receipt_show_notes: 'true' });
  assert.match(html, /@page\{size:58mm auto;margin:0\}/);
  assert.match(html, /max-width:54mm/);
  assert.match(html, /padding:10px 3mm 4px/);
  assert.match(html, /Extra long professional salon product name/);
  assert.match(html, /Discount/);
  assert.match(html, /Tax \(13%\)/);
  assert.match(html, /QR type/);
  assert.match(html, /AADHAR POS/);
  assert.ok(html.includes('YOUR BUSINESS. OUR BILLING.'));
  assert.ok(html.includes('Restaurant • Retail | <strong>AADHAR POS'));
  assert.doesNotMatch(html, /Legacy generic footer/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /page-break-inside:avoid/);
});

test('80 mm customer receipt uses its safe printable width and full imprint wording', () => {
  const html = buildCustomerReceiptHtml({ bill: { bill_number: 'SALON-43', subtotal: 500, grand_total: 500, payment_method: 'cash' }, items: [] }, { receipt_paper_size: '80' });
  assert.match(html, /@page\{size:80mm auto;margin:0\}/);
  assert.match(html, /max-width:76mm/);
  assert.match(html, /Thank you for visiting/);
  assert.ok(html.includes('Restaurant • Retail • Salon • Cosmetics | <strong>AADHAR POS'));
});

test('Aadhar imprint prints only a configured contact and shortens the verticals line rather than wrapping', () => {
  assert.equal(getReceiptBranding('80', '9800000000').contact, '9800000000');
  assert.equal(getReceiptBranding('58', 'a-very-long-verified-billing-domain.example.com').contact, '');
  for (const paper of ['58', '80']) for (const contact of ['', '9800000000', 'billing.example.com']) {
    const b = getReceiptBranding(paper, contact);
    const line = `${b.verticals.length ? `${b.verticals.join(' • ')} | ` : ''}${b.wordmark}${b.contact ? ` · ${b.contact}` : ''}`;
    assert.ok(line.length <= (paper === '58' ? 38 : 58), line);
  }
});

test('Aadhar POS branding can be switched off, restoring the salon footer', () => {
  const bill = { bill: { bill_number: 'SALON-44', subtotal: 500, grand_total: 500, payment_method: 'cash' }, items: [] };
  const off = buildCustomerReceiptHtml(bill, { receipt_paper_size: '80', receipt_show_aadhar_branding: 'false', receipt_footer: 'Visit again soon' });
  assert.doesNotMatch(off, /AADHAR POS/);
  assert.match(off, /Visit again soon/);
  assert.equal(normalizeDocumentSettings({}).receipt_show_aadhar_branding, 'true');
  assert.match(buildCustomerReceiptHtml(bill, { receipt_paper_size: '80' }), /AADHAR POS/);
});
