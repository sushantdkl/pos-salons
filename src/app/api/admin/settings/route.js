import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireRole } from '@/lib/salon-schema';
import { PHONE_ERROR_MESSAGE, phoneOrNull } from '@/lib/validation/phone';
import { setServerCalendarSystem } from '@/lib/dates/calendar-setting';
import { DOCUMENT_DEFAULTS, QR_PRINT_SIZES, QR_SHEET_SIZES, SETTING_KEYS, STATEMENT_PAPER_SIZES, normalizeDocumentSettings } from '@/lib/documents/settings';

const DEFAULT_KEYS = [
  'vat_percentage',
  'service_charge_percentage',
  'salon_name',
  'salon_address',
  'salon_phone',
  'salon_email',
  'owner_name',
  'vat_number',
  'pan_number',
  'currency_symbol',
  'bank_qr_image',
  'esewa_qr_image',
  'esewa_phonepay_qr_url',
  'bank_qr_url',
  'esewa_phonepay_label',
  'bank_label',
  'bank_name',
  'bank_account_name',
  'bank_account_number',
  'show_esewa_phonepay_qr',
  'show_bank_qr',
  'receipt_footer',
];

async function seedDefaultsIfEmpty(db) {
  const countRow = await db.get('SELECT COUNT(*)::int as count FROM system_settings');
  if (Number(countRow?.count || 0) > 0) return;

  let salonInfo = { name: '', address: '', phone: '', email: '' };
  let ownerName = '';
  try {
    const licenseInfo = await db.get(`
      SELECT salon_name, salon_address, salon_phone, salon_email, owner_name
      FROM license_info ORDER BY id DESC LIMIT 1
    `);
    if (licenseInfo) {
      salonInfo = {
        name: licenseInfo.salon_name || '',
        address: licenseInfo.salon_address || '',
        phone: licenseInfo.salon_phone || '',
        email: licenseInfo.salon_email || '',
      };
      ownerName = licenseInfo.owner_name || '';
    }
  } catch {
    // license_info optional
  }

  const defaults = [
    { key: 'vat_percentage', value: '13' },
    { key: 'service_charge_percentage', value: '10' },
    { key: 'salon_name', value: salonInfo.name },
    { key: 'salon_address', value: salonInfo.address },
    { key: 'salon_phone', value: salonInfo.phone },
    { key: 'salon_email', value: salonInfo.email },
    { key: 'owner_name', value: ownerName },
    { key: 'vat_number', value: '' },
    { key: 'pan_number', value: '' },
    { key: 'currency_symbol', value: 'Rs' },
    { key: 'bank_qr_image', value: '' },
    { key: 'esewa_qr_image', value: '' },
    { key: 'esewa_phonepay_qr_url', value: '' },
    { key: 'bank_qr_url', value: '' },
    { key: 'esewa_phonepay_label', value: 'Esewa / PhonePay QR' },
    { key: 'bank_label', value: 'Bank QR' },
    { key: 'bank_name', value: '' },
    { key: 'bank_account_name', value: '' },
    { key: 'bank_account_number', value: '' },
    { key: 'show_esewa_phonepay_qr', value: 'true' },
    { key: 'show_bank_qr', value: 'true' },
    { key: 'receipt_footer', value: 'Thank you for visiting. Please visit again.' },
  ];

  for (const setting of defaults) {
    await db.run(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO NOTHING',
      [setting.key, setting.value]
    );
  }
}

/** Until the Printer page saves its own QR sheet wording, keep the wording set earlier in CRM. */
async function withQrFallback(db, stored, normalized) {
  if (stored.qr_title) return normalized;
  const crm = await db.get('SELECT qr_headline, qr_subtext, qr_footer FROM crm_settings WHERE id = 1').catch(() => null);
  if (crm?.qr_headline) normalized.qr_title = crm.qr_headline;
  if (crm?.qr_subtext && !stored.qr_instruction) normalized.qr_instruction = crm.qr_subtext;
  if (crm?.qr_footer && !stored.qr_footer) normalized.qr_footer = crm.qr_footer;
  return normalized;
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || '';
    await requireRole(request, db, mode === 'payment-qr' || mode === 'documents' ? ['admin', 'cashier'] : 'admin');
    await seedDefaultsIfEmpty(db);

    const settingsArray = await db.all('SELECT setting_key, setting_value FROM system_settings');
    const settings = {};
    settingsArray.forEach((row) => {
      const key = row.setting_key;
      let value = row.setting_value;
      if (key === 'vat_percentage' || key === 'service_charge_percentage') {
        value = parseFloat(value) || 0;
      }
      settings[key] = value;
    });

    if (mode === 'payment-qr') {
      return NextResponse.json({
        settings: {
          salon_name: settings.salon_name || 'The Hair Cut',
          salon_address: settings.salon_address || '',
          salon_phone: settings.salon_phone || '',
          salon_email: settings.salon_email || '',
          vat_number: settings.vat_number || settings.pan_number || '',
          receipt_footer: settings.receipt_footer || 'Thank you for visiting. Please visit again.',
          currency_symbol: settings.currency_symbol || 'Rs',
          esewa_phonepay_qr_url: settings.esewa_phonepay_qr_url || settings.esewa_qr_image || '',
          bank_qr_url: settings.bank_qr_url || settings.bank_qr_image || '',
          esewa_phonepay_label: settings.esewa_phonepay_label || 'Esewa / PhonePay QR',
          bank_label: settings.bank_label || 'Bank QR',
          bank_name: settings.bank_name || '',
          bank_account_name: settings.bank_account_name || '',
          bank_account_number: settings.bank_account_number || '',
          show_esewa_phonepay_qr: settings.show_esewa_phonepay_qr !== 'false',
          show_bank_qr: settings.show_bank_qr !== 'false',
          calendar_system: settings.calendar_system || 'AD',
          receipt_paper_size: settings.receipt_paper_size || '80',
          receipt_title: settings.receipt_title || 'Customer Receipt',
          receipt_invoice_label: settings.receipt_invoice_label || 'Invoice',
          receipt_quantity_label: settings.receipt_quantity_label || 'Qty',
          receipt_item_label: settings.receipt_item_label || 'Item',
          receipt_rate_label: settings.receipt_rate_label || 'Rate',
          receipt_amount_label: settings.receipt_amount_label || 'Amount',
          receipt_show_salon_name: settings.receipt_show_salon_name !== 'false',
          receipt_show_address: settings.receipt_show_address !== 'false',
          receipt_show_phone: settings.receipt_show_phone !== 'false',
          receipt_show_pan_vat: settings.receipt_show_pan_vat !== 'false',
          receipt_show_date_time: settings.receipt_show_date_time !== 'false',
          receipt_show_customer: settings.receipt_show_customer !== 'false',
          receipt_show_stylist: settings.receipt_show_stylist !== 'false',
          receipt_show_payment: settings.receipt_show_payment !== 'false',
          receipt_show_tax: settings.receipt_show_tax !== 'false',
          receipt_show_discount: settings.receipt_show_discount !== 'false',
        },
      });
    }

    // Printed documents (credit statements, Review QR sheets) for Admin and Cashier: layout and
    // wording plus the salon letterhead — no payment or bank details.
    if (mode === 'documents') {
      const documentKeys = Object.keys(DOCUMENT_DEFAULTS).filter((key) => key.startsWith('statement_') || key.startsWith('qr_'));
      const normalized = await withQrFallback(db, settings, normalizeDocumentSettings({ ...DOCUMENT_DEFAULTS, ...settings }));
      return NextResponse.json({
        settings: {
          salon_name: settings.salon_name || 'The Hair Cut', salon_address: settings.salon_address || '', salon_phone: settings.salon_phone || '',
          salon_email: settings.salon_email || '', pan_number: settings.pan_number || '', vat_number: settings.vat_number || '',
          calendar_system: normalized.calendar_system,
          ...Object.fromEntries(documentKeys.map((key) => [key, normalized[key]])),
        },
      });
    }

    return NextResponse.json({ settings: await withQrFallback(db, settings, normalizeDocumentSettings({ ...DOCUMENT_DEFAULTS, ...settings })) });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const data = await request.json();
    const db = Database.getInstance();
    await requireRole(request, db, 'admin');
    if (String(data.salon_phone || '').trim() && !phoneOrNull(data.salon_phone)) {
      return NextResponse.json({ error: PHONE_ERROR_MESSAGE, message: PHONE_ERROR_MESSAGE, field: 'salon_phone' }, { status: 400 });
    }

    // Validate every key first so a bad value never leaves a half-saved form.
    for (const [key, value] of Object.entries(data)) {
      if (!SETTING_KEYS.has(key)) {
        return NextResponse.json({ error: `Unsupported setting: ${key}` }, { status: 400 });
      }
      if (key === 'calendar_system' && !['AD', 'BS'].includes(String(value).toUpperCase())) {
        return NextResponse.json({ error: 'Calendar must be AD or BS' }, { status: 400 });
      }
      if (key === 'receipt_paper_size' && !['58', '80'].includes(String(value))) {
        return NextResponse.json({ error: 'Receipt paper must be 58 mm or 80 mm' }, { status: 400 });
      }
      if (key === 'statement_paper_size' && !STATEMENT_PAPER_SIZES.includes(String(value))) {
        return NextResponse.json({ error: 'Statement page must be A4, 80 mm or 58 mm' }, { status: 400 });
      }
      if (key === 'qr_sheet_size' && !QR_SHEET_SIZES.includes(String(value))) {
        return NextResponse.json({ error: 'QR sheet must be A4, A5 or A6' }, { status: 400 });
      }
      if (key === 'qr_print_size_mm' && !QR_PRINT_SIZES.includes(String(value))) {
        return NextResponse.json({ error: 'Choose a listed QR size' }, { status: 400 });
      }
      if ((key.startsWith('statement_') || key.startsWith('qr_')) && String(value ?? '').length > 200) {
        return NextResponse.json({ error: 'Printed text must be 200 characters or fewer' }, { status: 400 });
      }
      if (key === 'advance_ceiling_percent' && value !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 100)) {
        return NextResponse.json({ error: 'Advance ceiling must be greater than 0 and no more than 100' }, { status: 400 });
      }
    }

    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(data)) {
        const settingValue = key === 'salon_phone' ? phoneOrNull(value) || '' : value;
        await tx.run(`
          INSERT INTO system_settings (setting_key, setting_value, updated_at)
          VALUES (?, ?, NOW())
          ON CONFLICT (setting_key) DO UPDATE SET
            setting_value = EXCLUDED.setting_value,
            updated_at = NOW()
        `, [key, String(settingValue)]);
      }
    });

    if (data.calendar_system !== undefined) setServerCalendarSystem(data.calendar_system);
    return NextResponse.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: error.status || 500 });
  }
}
