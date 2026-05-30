'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/dashboard-layout';
import { Edit, Key, Plus, Search, Trash2, Users } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { APP_ROLES, ROLE_LABELS } from '@/constants/roles';

const emptyForm = {
  username: '',
  full_name: '',
  salon_role: 'stylist',
  password: '',
  email: '',
  phone: '',
  commission_percentage: 10,
  base_salary: 0,
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

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

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
    setEditingStaff(employee);
    setFormData(employee ? {
      username: employee.username,
      full_name: employee.full_name,
      salon_role: employee.salon_role,
      password: '',
      email: employee.email || '',
      phone: employee.phone || '',
      commission_percentage: employee.commission_percentage || 0,
      base_salary: employee.base_salary || 0,
      assigned_services: employee.assigned_services || '',
      is_active: !!employee.is_active
    } : emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/admin/employees', {
      method: editingStaff ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(editingStaff ? { ...formData, id: editingStaff.id } : formData)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not save staff member');
      return;
    }
    setShowForm(false);
    setEditingStaff(null);
    setFormData(emptyForm);
    fetchStaff();
  };

  const deactivateStaff = async (id) => {
    if (!confirm('Deactivate this staff member?')) return;
    const response = await fetch(`/api/admin/employees?id=${id}`, { method: 'DELETE', headers: headers() });
    if (response.ok) fetchStaff();
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-950">Staff & Commission</h1>
              <p className="mt-1 text-sm text-gray-600">Salon roles, PIN access, service revenue, and commission summaries.</p>
            </div>
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800">
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

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full">
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
                        <button onClick={() => openForm(employee)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => deactivateStaff(employee.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredStaff.length === 0 && <div className="p-8 text-center text-gray-500"><Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />No staff found.</div>}
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
                <input required value={formData.username} onChange={(event) => setFormData({ ...formData, username: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Staff name *</span>
                <input required value={formData.full_name} onChange={(event) => setFormData({ ...formData, full_name: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Role *</span>
                <select value={formData.salon_role} onChange={(event) => setFormData({ ...formData, salon_role: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900">
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
                <input value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Commission %</span>
                <input type="number" min="0" max="100" step="0.01" value={formData.commission_percentage} onChange={(event) => setFormData({ ...formData, commission_percentage: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Base salary</span>
                <input type="number" min="0" step="0.01" value={formData.base_salary} onChange={(event) => setFormData({ ...formData, base_salary: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex items-center gap-2 pt-8 text-sm font-medium text-gray-900">
                <input type="checkbox" checked={formData.is_active} onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })} />
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
    </AdminLayout>
  );
}
