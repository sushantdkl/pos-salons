import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireRole } from '@/lib/salon-schema';
import { PHONE_ERROR_MESSAGE, phoneOrNull } from '@/lib/validation/phone';

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
  ];

  for (const setting of defaults) {
    await db.run(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT (setting_key) DO NOTHING',
      [setting.key, setting.value]
    );
  }
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || '';
    await requireRole(request, db, mode === 'payment-qr' ? ['admin', 'cashier'] : 'admin');
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
          esewa_phonepay_qr_url: settings.esewa_phonepay_qr_url || settings.esewa_qr_image || '',
          bank_qr_url: settings.bank_qr_url || settings.bank_qr_image || '',
          esewa_phonepay_label: settings.esewa_phonepay_label || 'Esewa / PhonePay QR',
          bank_label: settings.bank_label || 'Bank QR',
          bank_name: settings.bank_name || '',
          bank_account_name: settings.bank_account_name || '',
          bank_account_number: settings.bank_account_number || '',
          show_esewa_phonepay_qr: settings.show_esewa_phonepay_qr !== 'false',
          show_bank_qr: settings.show_bank_qr !== 'false',
        },
      });
    }

    return NextResponse.json({ settings });
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

    for (const [key, value] of Object.entries(data)) {
      const settingValue = key === 'salon_phone' ? phoneOrNull(value) || '' : value;
      await db.run(`
        INSERT INTO system_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, NOW())
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      `, [key, String(settingValue)]);
    }

    return NextResponse.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: error.status || 500 });
  }
}
