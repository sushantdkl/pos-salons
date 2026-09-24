import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireAuth } from '@/lib/salon-schema';
import { hasPermission } from '@/lib/auth/permissions';
import { publicErrorMessage } from '@/lib/api/errors';

export async function crmContext(request) {
  const db = Database.getInstance();
  await ensureSalonSchema();
  const user = await requireAuth(request, db);
  return { db, user };
}

export async function requireCrm(db, user, ...permissions) {
  for (const permission of permissions) {
    if (await hasPermission(db, user, permission)) return;
  }
  const error = new Error('Access denied');
  error.status = 403;
  throw error;
}

export function crmError(error, fallback = 'Unable to complete the request.') {
  const status = error?.status || 500;
  if (status < 500) return NextResponse.json({ error: error.message, code: error.code }, { status });
  if (error?.code === '23505') return NextResponse.json({ error: 'That already exists.', code: 'DUPLICATE' }, { status: 409 });
  console.error('CRM API failed:', error);
  return NextResponse.json({ error: publicErrorMessage(error, fallback) }, { status: 500 });
}
