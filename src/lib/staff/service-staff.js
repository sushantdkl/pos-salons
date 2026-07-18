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

function parseAssignedServices(value) {
  return String(value || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function serviceMatchKeys(service) {
  const name = String(service?.name || '').trim().toLowerCase();
  const category = String(service?.category || '').trim().toLowerCase();
  const packageItems = String(service?.package_items || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [name, category, ...packageItems].filter(Boolean);
}

/**
 * Soft match: assigned list empty = can do all.
 * Matches service name, category, package items, or fuzzy contains.
 */
export function staffCanPerformService(employee, service) {
  if (!employee || !service) return false;
  const assigned = parseAssignedServices(employee.assigned_services);
  if (!assigned.length) return true;

  const keys = serviceMatchKeys(service);
  return keys.some((key) =>
    assigned.some(
      (assignedName) =>
        assignedName === key ||
        key.includes(assignedName) ||
        assignedName.includes(key) ||
        (key.includes('facial') && assignedName === 'facial')
    )
  );
}

export function staffForService(employees, service) {
  const list = (employees || []).filter(activeServiceStaffFilter);
  const preferred = list.filter((employee) => staffCanPerformService(employee, service));
  // Always allow any service staff on the bill; prefer assigned ones first.
  if (!preferred.length) return list;
  const preferredIds = new Set(preferred.map((employee) => Number(employee.id)));
  const others = list.filter((employee) => !preferredIds.has(Number(employee.id)));
  return [...preferred, ...others];
}
