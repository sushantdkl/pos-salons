import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireRole } from '@/lib/salon-schema';

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
    await requireRole(request, db, 'admin');
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

    for (const [key, value] of Object.entries(data)) {
      await db.run(`
        INSERT INTO system_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, NOW())
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = NOW()
      `, [key, String(value)]);
    }

    return NextResponse.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: error.status || 500 });
  }
}
