'use client';

import { useEffect, useMemo, useState } from 'react';
import { Edit, Key, Plus, Power, PowerOff, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { APP_ROLES, ROLE_LABELS } from '@/constants/roles';
import { ConfirmDialog, AlertDialog } from '@/components/shared/confirm-dialog';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';

const emptyForm = {
  username: '',
  full_name: '',
  salon_role: 'stylist',
  password: '',
  email: '',
  phone: '',
  commission_percentage: '',
  base_salary: '',
  assigned_services: '',
  is_active: true
};

export default function StaffPage() {
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [pageMessage, setPageMessage] = useState('');
  const [alertDialog, setAlertDialog] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });
    const isDefaultAdmin = (employee) => String(employee?.username || '').toLowerCase() === 'admin' && String(employee?.role || '').toLowerCase() === 'admin';

  const fetchStaff = async () => {
    const response = await fetch('/api/admin/employees', { headers: headers() });
    if (response.ok) {
      const data = await response.json();
      setStaff(data.employees || []);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const filteredStaff = useMemo(() => staff.filter((employee) =>
    employee.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.salon_role.toLowerCase().includes(searchTerm.toLowerCase())
  ), [staff, searchTerm]);

  const openForm = (employee = null) => {
    setError('');
    setPageMessage('');
    setEditingStaff(employee);
    setFormData(employee ? {
      username: employee.username,
      full_name: employee.full_name,
      salon_role: employee.salon_role,
      password: '',
      email: employee.email || '',
      phone: employee.phone || '',
      commission_percentage: employee.commission_percentage ?? '',
      base_salary: employee.base_salary ?? '',
      assigned_services: employee.assigned_services || '',
      is_active: !!employee.is_active
    } : emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setPageMessage('');
    if (formData.phone && !isValidPhone(formData.phone)) {
      setError(PHONE_ERROR_MESSAGE);
      return;
    }
    const response = await fetch('/api/admin/employees', {
      method: editingStaff ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(editingStaff
        ? {
            ...formData,
            id: editingStaff.id,
            commission_percentage: Number(formData.commission_percentage || 0),
            base_salary: Number(formData.base_salary || 0),
          }
        : {
            ...formData,
            commission_percentage: Number(formData.commission_percentage || 0),
            base_salary: Number(formData.base_salary || 0),
          })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.message || data.error || 'Could not save staff member');
      return;
    }
    setShowForm(false);
    setEditingStaff(null);
    setFormData(emptyForm);
    setPageMessage(data.message || 'Staff member saved successfully.');
    fetchStaff();
  };

  const toggleStaffStatus = async (employee) => {
    if (isDefaultAdmin(employee)) return;
    const nextActive = !employee.is_active;
    setActionLoading(true);
    setPageMessage('');
    const response = await fetch('/api/admin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ id: employee.id, is_active: nextActive })
    });
    const data = await response.json();
    if (!response.ok) {
      setConfirmAction(null);
      setActionLoading(false);
      setAlertDialog({
        title: 'Cannot update staff',
        description: data.message || data.error || 'Could not update staff status.',
        tone: 'danger',
      });
      return;
    }
    setPageMessage(data.message || 'Staff status updated.');
    setConfirmAction(null);
    setActionLoading(false);
    fetchStaff();
  };

  const deleteStaff = async (employee) => {
    if (isDefaultAdmin(employee)) return;
    setActionLoading(true);
    setPageMessage('');
    const response = await fetch(`/api/admin/employees?id=${employee.id}`, { method: 'DELETE', headers: headers() });
    const data = await response.json();
    if (!response.ok) {
      setConfirmAction(null);
      setActionLoading(false);
      setAlertDialog({
        title: 'Cannot delete staff',
        description: data.message || data.error || 'Could not delete staff member.',
        tone: 'danger',
      });
      return;
    }
    setPageMessage(data.message || 'Staff member deleted successfully.');
    setConfirmAction(null);
    setActionLoading(false);
    fetchStaff();
  };

  const editingDefaultAdmin = isDefaultAdmin(editingStaff);

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Staff & Commission</h1>
              <p className="mt-1 text-sm text-gray-600">Salon roles, PIN access, service revenue, and commission summaries.</p>
            </div>
            <button onClick={() => openForm()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800 sm:w-auto">
              <Plus className="h-5 w-5" />
              Add Staff
            </button>
          </div>

          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search staff by name, username, or role" className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>

          {pageMessage ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {pageMessage}
            </div>
          ) : null}

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filteredStaff.map((employee) => (
              <div key={employee.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-950">{employee.full_name}</p>
                    <p className="truncate text-sm text-gray-500">{employee.username}{employee.phone ? ` · ${employee.phone}` : ''}</p>
                    <p className="mt-1 text-sm text-gray-700">{ROLE_LABELS[employee.salon_role] || employee.salon_role}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${employee.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {employee.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500">Revenue</p>
                    <p className="font-semibold text-gray-950">{formatCurrency(employee.service_revenue || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500">Commission</p>
                    <p className="font-semibold text-gray-950">{formatCurrency(employee.commission_earned || 0)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg bg-gray-50 p-2.5">
                    <p className="text-xs text-gray-500">Salary + Commission</p>
                    <p className="font-semibold text-gray-950">{formatCurrency(Number(employee.base_salary || 0) + Number(employee.commission_earned || 0))}</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => openForm(employee)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50" aria-label="Edit staff"><Edit className="h-5 w-5" /></button>
                  {isDefaultAdmin(employee) ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
                      <ShieldCheck className="h-4 w-4" />
                      Protected
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: 'toggleStaff', employee })}
                        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg ${employee.is_active ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}
                        title={employee.is_active ? 'Mark inactive' : 'Mark active'}
                      >
                        {employee.is_active ? <PowerOff className="h-5 w-5" /> : <Power className="h-5 w-5" />}
                      </button>
                      <button type="button" onClick={() => setConfirmAction({ type: 'deleteStaff', employee })} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" title="Delete staff"><Trash2 className="h-5 w-5" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {filteredStaff.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
                <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-700">No staff members found.</p>
                <p className="mt-1 text-sm">Staff members will appear here after they are added.</p>
              </div>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="min-w-[860px] w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">Staff</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Service Revenue</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Commission</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Salary + Commission</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStaff.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-950">{employee.full_name}</p>
                      <p className="text-sm text-gray-500">{employee.username} {employee.phone ? `• ${employee.phone}` : ''}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{ROLE_LABELS[employee.salon_role] || employee.salon_role}</td>
                    <td className="px-5 py-4 text-right font-medium text-gray-950">{formatCurrency(employee.service_revenue || 0)}</td>
                    <td className="px-5 py-4 text-right text-gray-700">{formatCurrency(employee.commission_earned || 0)} <span className="text-xs text-gray-500">({employee.commission_percentage || 0}%)</span></td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-950">{formatCurrency(Number(employee.base_salary || 0) + Number(employee.commission_earned || 0))}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-medium ${employee.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{employee.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openForm(employee)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" /></button>
                        {isDefaultAdmin(employee) ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
                            <ShieldCheck className="h-4 w-4" />
                            Protected
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => setConfirmAction({ type: 'toggleStaff', employee })}
                              className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg ${employee.is_active ? 'text-amber-700 hover:bg-amber-50' : 'text-green-700 hover:bg-green-50'}`}
                              title={employee.is_active ? 'Mark inactive' : 'Mark active'}
                            >
                              {employee.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                            </button>
                            <button onClick={() => setConfirmAction({ type: 'deleteStaff', employee })} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" title="Delete staff"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStaff.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-700">No staff members found.</p>
                <p className="mt-1 text-sm">Staff members will appear here after they are added.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-2xl font-semibold text-gray-950">{editingStaff ? 'Edit Staff' : 'Add Staff'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="grid gap-4 p-6 md:grid-cols-2">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2">{error}</div>}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Username *</span>
                <input
                  required
                  disabled={editingDefaultAdmin}
                  value={formData.username}
                  onChange={(event) => setFormData({
                    ...formData,
                    username: event.target.value.toLowerCase().replace(/\s+/g, ''),
                  })}
                  placeholder="e.g. raashid"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100 disabled:text-gray-500"
                />
                <p className="mt-1 text-xs text-gray-500">Must be unique. Letters/numbers only — used for login.</p>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Staff name *</span>
                <input required value={formData.full_name} onChange={(event) => setFormData({ ...formData, full_name: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Role *</span>
                <select disabled={editingDefaultAdmin} value={formData.salon_role} onChange={(event) => setFormData({ ...formData, salon_role: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-100 disabled:text-gray-500">
                  {APP_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">{editingStaff ? 'New PIN' : 'PIN *'}</span>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="text" inputMode="numeric" required={!editingStaff} value={formData.password} onChange={(event) => setFormData({ ...formData, password: event.target.value })} className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" placeholder="4 or more digits" />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Phone</span>
                <input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: sanitizePhoneInput(event.target.value) })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Commission %</span>
                <input type="number" min="0" max="100" step="0.01" value={formData.commission_percentage} onChange={(event) => setFormData({ ...formData, commission_percentage: event.target.value })} placeholder="e.g. 10" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Base salary</span>
                <input type="number" min="0" step="0.01" value={formData.base_salary} onChange={(event) => setFormData({ ...formData, base_salary: event.target.value })} placeholder="e.g. 25000" className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex items-center gap-2 pt-8 text-sm font-medium text-gray-900">
                <input type="checkbox" disabled={editingDefaultAdmin} checked={editingDefaultAdmin ? true : formData.is_active} onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })} />
                Active
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-gray-950 px-4 py-3 font-medium text-white hover:bg-gray-800">Save Staff</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmAction?.type === 'toggleStaff'}
        title={`${confirmAction?.employee?.is_active ? 'Deactivate' : 'Activate'} Staff`}
        description={`${confirmAction?.employee?.is_active ? 'Deactivate' : 'Activate'} ${confirmAction?.employee?.full_name || 'this staff member'}?`}
        confirmLabel={confirmAction?.employee?.is_active ? 'Deactivate' : 'Activate'}
        destructive={Boolean(confirmAction?.employee?.is_active)}
        loading={actionLoading}
        onCancel={() => !actionLoading && setConfirmAction(null)}
        onConfirm={() => toggleStaffStatus(confirmAction.employee)}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'deleteStaff'}
        title="Delete Staff"
        description={`Delete ${confirmAction?.employee?.full_name || 'this staff member'}? Staff with billing history must be marked inactive instead.`}
        confirmLabel="Delete"
        destructive
        loading={actionLoading}
        onCancel={() => !actionLoading && setConfirmAction(null)}
        onConfirm={() => deleteStaff(confirmAction.employee)}
      />
      <AlertDialog
        open={Boolean(alertDialog)}
        title={alertDialog?.title || 'Notice'}
        description={alertDialog?.description || ''}
        tone={alertDialog?.tone || 'default'}
        onClose={() => setAlertDialog(null)}
      />
    </>
  );
}
