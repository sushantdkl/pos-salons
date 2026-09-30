import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { mapApiError } from '@/lib/db/api-errors';
import { requireRole } from '@/lib/salon-schema';
import { CATEGORY_GROUPS, createCategory, deleteCategory, listCategories, updateCategory } from '@/lib/expenses/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error, fallback) {
  const mapped = mapApiError(error, fallback);
  return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await requireRole(request, db, 'admin');
    return NextResponse.json({ categories: await listCategories(db, { includeInactive: true, withUsage: true }), groups: CATEGORY_GROUPS });
  } catch (error) { return fail(error, 'Unable to load categories'); }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    const user = await requireRole(request, db, 'admin');
    const category = await createCategory(db, user, await request.json());
    return NextResponse.json({ message: 'Category added', category }, { status: 201 });
  } catch (error) { return fail(error, 'Unable to add category'); }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    const user = await requireRole(request, db, 'admin');
    const category = await updateCategory(db, user, await request.json());
    return NextResponse.json({ message: 'Category updated', category });
  } catch (error) { return fail(error, 'Unable to update category'); }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    const user = await requireRole(request, db, 'admin');
    const id = Number(new URL(request.url).searchParams.get('id') || 0);
    return NextResponse.json({ message: 'Category removed', ...(await deleteCategory(db, user, id)) });
  } catch (error) { return fail(error, 'Unable to remove category'); }
}
