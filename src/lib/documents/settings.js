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
  // Customer / supplier credit statements (A4 recommended; 80 / 58 mm thermal also supported).
  statement_customer_title: 'CUSTOMER CREDIT STATEMENT', statement_supplier_title: 'SUPPLIER CREDIT STATEMENT',
  statement_date_label: 'Date / Note', statement_debit_label: 'Debit', statement_credit_label: 'Credit', statement_balance_label: 'Balance',
  statement_footer: 'Please settle outstanding dues at your earliest convenience.',
  statement_show_not_tax_invoice: 'true', statement_show_pan: 'true', statement_show_address: 'true',
  statement_show_phone: 'true', statement_show_printed_at: 'true',
  // Review & Rewards QR sheets (the printed card customers scan to review and check rewards).
  qr_title: 'LOVE YOUR LOOK?', qr_instruction: 'Scan to leave a review & check your rewards',
  qr_station_label: '', qr_print_size_mm: '110', qr_sheet_size: 'a4', qr_footer: '',
  qr_show_salon_name: 'true', qr_show_border: 'true', qr_show_url: 'true',
});

export const STATEMENT_PAPER_SIZES = ['a4', '80', '58'];
export const QR_SHEET_SIZES = ['a4', 'a5', 'a6'];
export const QR_PRINT_SIZES = ['60', '90', '110', '130'];

export const SETTING_KEYS = new Set(['vat_percentage','service_charge_percentage','salon_name','salon_address','salon_phone','salon_email','owner_name','vat_number','pan_number','currency_symbol','bank_qr_image','esewa_qr_image','esewa_phonepay_qr_url','bank_qr_url','esewa_phonepay_label','bank_label','bank_name','bank_account_name','bank_account_number','show_esewa_phonepay_qr','show_bank_qr','advance_ceiling_percent','advance_eligible_basis', ...Object.keys(DOCUMENT_DEFAULTS)]);

export function normalizeDocumentSettings(input = {}) {
  const result = { ...DOCUMENT_DEFAULTS, ...input };
  result.calendar_system = String(result.calendar_system).toUpperCase() === 'BS' ? 'BS' : 'AD';
  result.business_timezone = 'Asia/Kathmandu';
  result.receipt_paper_size = String(result.receipt_paper_size) === '58' ? '58' : '80';
  result.statement_paper_size = STATEMENT_PAPER_SIZES.includes(String(result.statement_paper_size).toLowerCase()) ? String(result.statement_paper_size).toLowerCase() : 'a4';
  result.qr_sheet_size = QR_SHEET_SIZES.includes(String(result.qr_sheet_size).toLowerCase()) ? String(result.qr_sheet_size).toLowerCase() : 'a4';
  result.qr_print_size_mm = QR_PRINT_SIZES.includes(String(result.qr_print_size_mm)) ? String(result.qr_print_size_mm) : '110';
  return result;
}
