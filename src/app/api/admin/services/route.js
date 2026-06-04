import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { ensureSalonSchema, requireRole } from '@/lib/salon-schema';
import { ServiceManagementService } from '@/modules/services/service';

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    await requireRole(request, db, ['admin', 'cashier']);

    const { searchParams } = new URL(request.url);
    const service = new ServiceManagementService(db);

    return NextResponse.json(await service.list({
      search: searchParams.get('search'),
      category: searchParams.get('category'),
    }));
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to fetch services' }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const service = await new ServiceManagementService(db).create(data, user.id);
    return NextResponse.json({ message: 'Service created successfully', service }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to create service' }, { status: error.status || 500 });
  }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const data = await request.json();
    const service = await new ServiceManagementService(db).update(data, user.id);
    return NextResponse.json({ message: 'Service updated successfully', service });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to update service' }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const db = Database.getInstance();
    await ensureSalonSchema();
    const user = await requireRole(request, db, ['admin', 'cashier']);
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));
    await new ServiceManagementService(db).delete(id, user.id);
    return NextResponse.json({ message: 'Service deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to delete service' }, { status: error.status || 500 });
  }
}
