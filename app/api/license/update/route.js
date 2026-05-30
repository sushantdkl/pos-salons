import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Database from '@/lib/db/index';

const ADMIN_SERVER_URL = process.env.NEXT_PUBLIC_ADMIN_SERVER_URL || 'http://localhost:3001';

export async function POST(request) {
  try {
    const { license_key } = await request.json();

    if (!license_key) {
      return NextResponse.json(
        { error: 'License key is required' },
        { status: 400 }
      );
    }

    // Verify license with admin server
    const verifyResponse = await fetch(`${ADMIN_SERVER_URL}/api/verify-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!verifyResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'License verification failed. Please check the license key and your connection to the admin server.' },
        { status: 400 }
      );
    }

    const verificationData = await verifyResponse.json();

    if (!verificationData.valid) {
      return NextResponse.json(
        { success: false, error: verificationData.error || 'Invalid license key' },
        { status: 400 }
      );
    }

    // Update license file
    const licensePath = path.join(process.cwd(), 'databases', '.license');
    const licenseData = {
      license_key: license_key,
      restaurant_name: verificationData.restaurant_name,
      plan_type: verificationData.plan_type,
      expiry_date: verificationData.expiry_date,
      grace_period_days: verificationData.grace_period_days || 5,
      activated_at: new Date().toISOString(),
      last_verified: new Date().toISOString()
    };

    fs.writeFileSync(licensePath, JSON.stringify(licenseData, null, 2));

    // Update database license_info table
    const db = Database.getInstance().db;
    
    // Delete old license info
    db.prepare('DELETE FROM license_info').run();
    
    // Insert new license info with full restaurant details
    db.prepare(`
      INSERT INTO license_info (
        license_key, restaurant_name, restaurant_address, restaurant_phone, 
        restaurant_email, owner_name, plan_type, expiry_date, 
        grace_period_days, status, last_verified, activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      license_key,
      verificationData.restaurant?.name || verificationData.restaurant_name,
      verificationData.restaurant?.location || '',
      verificationData.restaurant?.contact_number || '',
      verificationData.restaurant?.contact_email || '',
      verificationData.restaurant?.owner_name || '',
      verificationData.plan_type,
      verificationData.expiry_date,
      verificationData.grace_period_days || 5,
      'active'
    );

    // Update system_settings with restaurant info from Firebase
    const settingsToUpdate = [
      { key: 'restaurant_name', value: verificationData.restaurant?.name || verificationData.restaurant_name },
      { key: 'restaurant_address', value: verificationData.restaurant?.location || '' },
      { key: 'restaurant_phone', value: verificationData.restaurant?.contact_number || '' },
      { key: 'restaurant_email', value: verificationData.restaurant?.contact_email || '' }
    ];

    const updateSetting = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET 
        setting_value = excluded.setting_value,
        updated_at = CURRENT_TIMESTAMP
    `);

    settingsToUpdate.forEach(setting => {
      if (setting.value) updateSetting.run(setting.key, setting.value);
    });

    return NextResponse.json({
      success: true,
      message: 'License updated successfully',
      license: {
        restaurant_name: verificationData.restaurant_name,
        plan_type: verificationData.plan_type,
        expiry_date: verificationData.expiry_date
      }
    });

  } catch (error) {
    console.error('License update error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update license. Please try again.' },
      { status: 500 }
    );
  }
}
