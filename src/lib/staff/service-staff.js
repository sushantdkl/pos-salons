export const SERVICE_STAFF_ROLES = ['barber', 'stylist', 'beautician'];

export function isServiceStaffRole(role) {
  return SERVICE_STAFF_ROLES.includes(String(role || '').toLowerCase());
}

export function hasServiceStaffRole(employee) {
  return isServiceStaffRole(employee?.salon_role || employee?.role);
}

export function activeServiceStaffFilter(employee) {
  return Boolean(employee?.is_active) && hasServiceStaffRole(employee);
}
