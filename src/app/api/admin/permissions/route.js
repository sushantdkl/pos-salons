import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireRole } from '@/lib/salon-schema';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_KEYS, PERMISSION_ROLES } from '@/lib/auth/permission-catalog';

const ROLES = new Set(PERMISSION_ROLES.map((role) => role.key));
const KEYS = new Set(PERMISSION_KEYS);
const CASHIER_PROTECTED_DENIALS = new Set(['payroll.payments.create','payroll.records.correct','payroll.records.delete']);

function validateChange(role, permission, allowed) {
  if (!ROLES.has(role) || !KEYS.has(permission) || typeof allowed !== 'boolean') {
    const error = new Error('Invalid permission change'); error.status = 400; throw error;
  }
  if (role === 'cashier' && allowed && CASHIER_PROTECTED_DENIALS.has(permission)) {
    const error = new Error('Cashiers can issue advances, but full salary payments and payroll corrections must remain blocked.'); error.status = 422; throw error;
  }
}

async function applyChanges(db, actor, role, changes) {
  if (!ROLES.has(role) || !Array.isArray(changes) || !changes.length) {
    const error = new Error('Select a valid role and at least one permission'); error.status = 400; throw error;
  }
  changes.forEach(({ permission, allowed }) => validateChange(role, permission, allowed));
  return db.transaction(async (tx) => {
    let changed = 0;
    for (const { permission, allowed } of changes) {
      const prior = await tx.get('SELECT allowed FROM role_permissions WHERE role=? AND permission_key=? FOR UPDATE', [role, permission]);
      if (prior && prior.allowed === allowed) continue;
      await tx.run(`INSERT INTO role_permissions(role,permission_key,allowed,updated_by,updated_at) VALUES (?,?,?,?,NOW()) ON CONFLICT(role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [role, permission, allowed, actor.id]);
      await tx.run('INSERT INTO permission_audit(role,permission_key,previous_value,new_value,actor_id) VALUES (?,?,?,?,?)', [role, permission, prior?.allowed ?? null, allowed, actor.id]);
      changed += 1;
    }
    return changed;
  });
}

export async function GET(request) {
  try {
    const db = Database.getInstance();
    await requireRole(request, db, 'admin');
    const { searchParams } = new URL(request.url);
    const permissions = await db.all('SELECT role,permission_key,allowed,updated_at FROM role_permissions ORDER BY role,permission_key');
    if (searchParams.get('view') === 'history') {
      const history = await db.all(`SELECT a.id,a.role,a.permission_key,a.previous_value,a.new_value,a.created_at,COALESCE(u.full_name,u.username,'System') actor_name FROM permission_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC,a.id DESC LIMIT 200`);
      return NextResponse.json({ history, roles: PERMISSION_ROLES, groups: PERMISSION_GROUPS });
    }
    return NextResponse.json({ permissions, roles: PERMISSION_ROLES, groups: PERMISSION_GROUPS, protectedDenials: [...CASHIER_PROTECTED_DENIALS] });
  } catch (error) { return NextResponse.json({ error: error.message || 'Unable to load permissions' }, { status: error.status || 500 }); }
}

export async function PUT(request) {
  try {
    const db = Database.getInstance();
    const actor = await requireRole(request, db, 'admin');
    const { role, permission, allowed } = await request.json();
    const changed = await applyChanges(db, actor, role, [{ permission, allowed }]);
    return NextResponse.json({ message: changed ? 'Permission updated' : 'Permission was already set', changed });
  } catch (error) { return NextResponse.json({ error: error.message || 'Unable to update permission' }, { status: error.status || 500 }); }
}

export async function PATCH(request) {
  try {
    const db = Database.getInstance(); const actor = await requireRole(request, db, 'admin');
    const data = await request.json(); const role = data.role;
    let changes = data.changes;
    if (data.action === 'reset') {
      const defaults = new Set(DEFAULT_ROLE_PERMISSIONS[role] || []);
      changes = PERMISSION_KEYS.map((permission) => ({ permission, allowed: defaults.has(permission) }));
    }
    const changed = await applyChanges(db, actor, role, changes);
    return NextResponse.json({ message: `${changed} permission${changed === 1 ? '' : 's'} updated`, changed });
  } catch (error) { return NextResponse.json({ error: error.message || 'Unable to update permissions' }, { status: error.status || 500 }); }
}
