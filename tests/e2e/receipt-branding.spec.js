import { test, expect } from '@playwright/test';
import { buildCustomerReceiptHtml } from '../../src/lib/documents/customer-receipt.js';

const MM_TO_PX = 96 / 25.4;
// Chromium ignores `size: <w>mm auto`, so the printer driver's paper decides the page.
// Typical thermal drivers expose either the full roll width or only its printable width,
// with a 297 mm page length; both are exercised here.
const DRIVER_PAPERS = { 58: [58, 48], 80: [80, 72] };
const DRIVER_PAGE_HEIGHT_MM = 297;

function receiptData(itemCount, paymentMethod = 'online') {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    item_type: index % 3 === 0 ? 'product' : 'service',
    name: index === 0 ? 'Professional colour correction and restorative hair treatment' : `Salon item ${index + 1}`,
    quantity: index % 4 === 0 ? 2 : 1,
    unit_price: 500 + index * 5,
    subtotal: (index % 4 === 0 ? 2 : 1) * (500 + index * 5),
    staff_name_snapshot: 'Stylist with a long display name',
  }));
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    bill: {
      bill_number: 'SALON-0000123', customer_name: 'Customer with a long printed name', customer_phone: '+977 9800000000',
      cashier_name: 'Administrator', subtotal, discount_amount: 125, tax: 146.25, tax_percent: 13,
      grand_total: subtotal + 21.25, payment_method: paymentMethod, qr_type: 'ESEWA_PHONEPAY', cash_amount: 500, qr_amount: subtotal - 478.75,
      notes: 'Customer requested a printed receipt.', transaction_time: '2026-09-21T04:50:00.000Z',
    },
    items,
  };
}

// The pre-imprint footer: divider, 10px gap, one 11px line, 14px bottom padding.
function legacyFooterVersion(html) {
  return html
    .replace(/padding:10px (\S+) 4px/, 'padding:10px $1 14px')
    .replace(/<footer class="receipt-imprint"[\s\S]*?<\/footer>/, '<hr class="divider" /><div style="text-align:center;margin-top:10px;font-size:11px">Thank you for visiting. Please visit again.</div>');
}

async function measure(page, html, widthMm) {
  await page.setViewportSize({ width: Math.floor(widthMm * MM_TO_PX), height: 900 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.emulateMedia({ media: 'print' });
  const dom = await page.evaluate(() => {
    const body = document.body;
    const footer = document.querySelector('.receipt-imprint');
    return {
      heightPx: Math.ceil(body.getBoundingClientRect().height),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      trailingSpace: footer ? Math.round(body.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom) : null,
      footerLines: footer ? [...footer.children].map((line) => { const range = document.createRange(); range.selectNodeContents(line); const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))); return { text: line.textContent, width: line.scrollWidth, available: line.clientWidth, renderedLines: tops.size }; }) : [],
    };
  });
  const pdf = await page.pdf({ width: `${widthMm}mm`, height: `${DRIVER_PAGE_HEIGHT_MM}mm`, printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  return { ...dom, pages, pdf };
}

const cases = [['short', 1, 'cash'], ['typical', 8, 'online'], ['long', 45, 'split']];

for (const contact of ['', '9800000000', 'billing.example.com']) {
  test(`Aadhar imprint adds no height, pages or overflow (contact: ${contact || 'none'})`, async ({ browser }, testInfo) => {
    process.env.NEXT_PUBLIC_AADHAR_POS_CONTACT = contact;
    const page = await browser.newPage();
    const report = [];
    for (const paper of ['58', '80']) {
      const settings = { receipt_paper_size: paper, salon_name: 'A Very Long Merchant Salon Name for Print Testing', salon_address: 'Birendranagar, Surkhet, Nepal', salon_phone: '+977 9800000000', vat_number: 'PAN-123456789', receipt_show_notes: 'true' };
      for (const driverWidth of DRIVER_PAPERS[paper]) {
        for (const [label, count, method] of cases) {
          const html = buildCustomerReceiptHtml(receiptData(count, method), settings);
          const current = await measure(page, html, driverWidth);
          const legacy = await measure(page, legacyFooterVersion(html), driverWidth);
          const name = `${paper}mm paper @ ${driverWidth}mm driver, ${label}`;
          report.push(`${name}: ${legacy.heightPx}px/${legacy.pages}p legacy → ${current.heightPx}px/${current.pages}p imprint | ${current.footerLines.map((line) => line.text).join(' / ')}`);
          if (!contact && label === 'typical' && driverWidth === Number(paper)) {
            await testInfo.attach(`receipt-${paper}mm.pdf`, { body: current.pdf, contentType: 'application/pdf' });
            await page.screenshot({ path: `test-results/customer-receipt-${paper}mm-print.png`, fullPage: true });
          }
          expect(current.heightPx, `${name} height`).toBeLessThanOrEqual(legacy.heightPx);
          expect(current.pages, `${name} page count`).toBeLessThanOrEqual(legacy.pages);
          expect(current.pages, `${name} trailing blank page`).toBe(Math.max(1, Math.ceil(current.heightPx / (DRIVER_PAGE_HEIGHT_MM * MM_TO_PX))));
          if (legacy.pages === 1) expect(current.pages, `${name} stays single page`).toBe(1);
          expect(current.horizontalOverflow, `${name} horizontal overflow`).toBe(false);
          expect(current.trailingSpace, `${name} trailing blank space`).toBeLessThanOrEqual(5);
          expect(current.footerLines).toHaveLength(3);
          for (const line of current.footerLines) {
            expect(line.width, `${name} imprint line clips: ${line.text}`).toBeLessThanOrEqual(line.available);
            expect(line.renderedLines, `${name} imprint line wraps: ${line.text}`).toBe(1);
          }
        }
      }
    }
    console.log(report.join('\n'));
    delete process.env.NEXT_PUBLIC_AADHAR_POS_CONTACT;
    await page.close();
  });
}
