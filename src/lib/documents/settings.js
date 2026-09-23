export const DOCUMENT_DEFAULTS = Object.freeze({
  calendar_system: 'AD', business_timezone: 'Asia/Kathmandu', receipt_paper_size: '80', statement_paper_size: 'a4',
  receipt_title: 'Customer Receipt', receipt_footer: 'Thank you for visiting. Please visit again.',
  receipt_invoice_label: 'Invoice', receipt_quantity_label: 'Qty', receipt_item_label: 'Item',
  receipt_rate_label: 'Rate', receipt_amount_label: 'Amount',
  receipt_show_salon_name: 'true', receipt_show_address: 'true', receipt_show_phone: 'true',
  receipt_show_pan_vat: 'true', receipt_show_date_time: 'true',
  receipt_show_customer: 'true', receipt_show_stylist: 'true', receipt_show_services: 'true', receipt_show_products: 'true',
  receipt_show_invoice_number: 'true', receipt_show_cashier: 'true', receipt_show_payment: 'true', receipt_show_tax: 'true', receipt_show_discount: 'true', receipt_show_notes: 'false',
  receipt_show_aadhar_branding: 'true',
});

export const SETTING_KEYS = new Set(['vat_percentage','service_charge_percentage','salon_name','salon_address','salon_phone','salon_email','owner_name','vat_number','pan_number','currency_symbol','bank_qr_image','esewa_qr_image','esewa_phonepay_qr_url','bank_qr_url','esewa_phonepay_label','bank_label','bank_name','bank_account_name','bank_account_number','show_esewa_phonepay_qr','show_bank_qr','advance_ceiling_percent','advance_eligible_basis', ...Object.keys(DOCUMENT_DEFAULTS)]);

export function normalizeDocumentSettings(input = {}) {
  const result = { ...DOCUMENT_DEFAULTS, ...input };
  result.calendar_system = String(result.calendar_system).toUpperCase() === 'BS' ? 'BS' : 'AD';
  result.business_timezone = 'Asia/Kathmandu';
  result.receipt_paper_size = String(result.receipt_paper_size) === '58' ? '58' : '80';
  result.statement_paper_size = 'a4';
  return result;
}
