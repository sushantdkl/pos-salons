'use client';

import { useEffect, useMemo, useState } from 'react';
import { Edit, History, MessageCircle, Phone, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { activeServiceStaffFilter } from '@/lib/staff/service-staff';
import { PHONE_ERROR_MESSAGE, isValidPhone, sanitizePhoneInput } from '@/lib/validation/phone';

const emptyForm = {
  name: '',
  phone: '',
  gender: '',
  address: '',
  favorite_services: '',
  preferred_stylist_id: '',
  notes: '',
  email: '',
  credit_limit: 0
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedBills, setSelectedBills] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

  const fetchCustomers = async () => {
    const response = await fetch('/api/admin/customers', { headers: headers() });
    if (response.ok) {
      const data = await response.json();
      setCustomers(data.customers || []);
    }
  };

  const fetchStaff = async () => {
    const response = await fetch('/api/admin/employees', { headers: headers() });
    if (response.ok) {
      const data = await response.json();
      setStaff((data.employees || []).filter(activeServiceStaffFilter));
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchStaff();
  }, []);

  const filteredCustomers = useMemo(() => customers.filter((customer) =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.includes(searchTerm)
  ), [customers, searchTerm]);

  const openForm = (customer = null) => {
    setError('');
    setFieldErrors({});
    setEditingCustomer(customer);
    setFormData(customer ? {
      name: customer.name || '',
      phone: customer.phone || '',
      gender: customer.gender || '',
      address: customer.address || '',
      favorite_services: customer.favorite_services || '',
      preferred_stylist_id: customer.preferred_stylist_id || '',
      notes: customer.notes || '',
      email: customer.email || '',
      credit_limit: customer.credit_limit || 0
    } : emptyForm);
    setShowModal(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    if (formData.phone && !isValidPhone(formData.phone)) {
      setFieldErrors({ phone: PHONE_ERROR_MESSAGE });
      return;
    }
    const response = await fetch('/api/admin/customers', {
      method: editingCustomer ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(editingCustomer ? { ...formData, id: editingCustomer.id } : formData)
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.field === 'phone' || data.code === 'CUSTOMER_PHONE_EXISTS') {
        setFieldErrors({ phone: data.message || 'This phone number is already registered.' });
      } else {
        setError(data.message || data.error || 'Could not save customer');
      }
      return;
    }
    setShowModal(false);
    setEditingCustomer(null);
    setFormData(emptyForm);
    fetchCustomers();
  };

  const handleDelete = async (id) => {
    setActionLoading(true);
    const response = await fetch(`/api/admin/customers?id=${id}`, { method: 'DELETE', headers: headers() });
    if (response.ok) {
      setConfirmAction(null);
      fetchCustomers();
    } else {
      const data = await response.json();
      setError(data.message || data.error || 'Could not delete customer');
    }
    setActionLoading(false);
  };

  const viewHistory = async (customer) => {
    const response = await fetch(`/api/admin/customers?id=${customer.id}`, { headers: headers() });
    if (response.ok) {
      const data = await response.json();
      setSelectedCustomer(data.customer);
      setSelectedBills(data.bills || []);
    }
  };

  const sendWhatsApp = (customer) => {
    const phone = (customer.phone || '').replace(/[^\d]/g, '');
    if (!phone) {
      setError('Customer phone number is required for WhatsApp reminder.');
      return;
    }
    const message = `Namaste ${customer.name}, this is a reminder from The Hair Cut. We look forward to serving you again.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-950">Customers</h1>
              <p className="mt-1 text-sm text-gray-600">Profiles, preferences, repeat visits, bills, and manual reminders.</p>
            </div>
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800">
              <Plus className="h-5 w-5" />
              Add Customer
            </button>
          </div>

          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by name or phone" className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCustomers.map((customer) => (
              <div key={customer.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-950">{customer.name}</h2>
                      {customer.is_repeat ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Repeat</span> : null}
                    </div>
                    {customer.phone && <p className="mt-1 flex items-center gap-2 text-sm text-gray-600"><Phone className="h-4 w-4" />{customer.phone}</p>}
                  </div>
                  <UserRound className="h-8 w-8 text-gray-300" />
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Visits</p>
                    <p className="font-semibold text-gray-950">{customer.total_visits || 0}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Spending</p>
                    <p className="font-semibold text-gray-950">{formatCurrency(customer.total_spent || 0)}</p>
                  </div>
                </div>
                <p className="mb-2 text-sm text-gray-600">Favorite: {customer.favorite_services || 'Not set'}</p>
                <p className="mb-4 text-sm text-gray-600">Preferred stylist: {customer.preferred_stylist_name || 'Any'}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => sendWhatsApp(customer)} className="rounded-lg p-2 text-green-600 hover:bg-green-50" title="Send WhatsApp reminder"><MessageCircle className="h-4 w-4" /></button>
                  <button onClick={() => viewHistory(customer)} className="rounded-lg p-2 text-gray-700 hover:bg-gray-100" title="View visit history"><History className="h-4 w-4" /></button>
                  <button onClick={() => openForm(customer)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Edit customer"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => setConfirmAction({ type: 'deleteCustomer', customer })} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Delete customer"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {filteredCustomers.length === 0 && (
              <div className="col-span-full rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                <p className="font-medium text-gray-700">No customers found.</p>
                <p className="mt-1 text-sm">Customer profiles will appear here after they are added or saved during billing.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-2xl font-semibold text-gray-950">{editingCustomer ? 'Edit Customer' : 'Add Customer'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="grid gap-4 p-6 md:grid-cols-2">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 md:col-span-2">{error}</div>}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Name *</span>
                <input required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Phone</span>
                <input value={formData.phone} onChange={(event) => {
                  setFieldErrors({ ...fieldErrors, phone: '' });
                  setFormData({ ...formData, phone: sanitizePhoneInput(event.target.value) });
                }} className={`w-full rounded-lg border px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900 ${fieldErrors.phone ? 'border-red-300' : 'border-gray-300'}`} />
                {fieldErrors.phone ? <p className="mt-1 text-sm font-medium text-red-600">{fieldErrors.phone}</p> : null}
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Gender</span>
                <select value={formData.gender} onChange={(event) => setFormData({ ...formData, gender: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Optional</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Preferred stylist</span>
                <select value={formData.preferred_stylist_id} onChange={(event) => setFormData({ ...formData, preferred_stylist_id: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">Any staff</option>
                  {staff.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-900">Favorite services</span>
                <input value={formData.favorite_services} onChange={(event) => setFormData({ ...formData, favorite_services: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-900">Address</span>
                <input value={formData.address} onChange={(event) => setFormData({ ...formData, address: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-900">Notes / preferences</span>
                <textarea rows={3} value={formData.notes} onChange={(event) => setFormData({ ...formData, notes: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-gray-950 px-4 py-3 font-medium text-white hover:bg-gray-800">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-gray-950">{selectedCustomer.name}</h2>
                <p className="text-sm text-gray-600">Visit history and past bills</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700">Close</button>
            </div>
            <div className="space-y-3">
              {selectedBills.map((bill) => (
                <div key={bill.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-950">{bill.bill_number}</p>
                    <p className="font-semibold text-gray-950">{formatCurrency(bill.grand_total)}</p>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{new Date(bill.created_at).toLocaleString()} • {bill.payment_method}</p>
                </div>
              ))}
              {selectedBills.length === 0 && <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">No visits yet.</div>}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmAction?.type === 'deleteCustomer'}
        title="Delete Customer"
        description={`Delete ${confirmAction?.customer?.name || 'this customer'}? This cannot be undone if the record has no protected history.`}
        confirmLabel="Delete"
        destructive
        loading={actionLoading}
        onCancel={() => !actionLoading && setConfirmAction(null)}
        onConfirm={() => handleDelete(confirmAction.customer.id)}
      />
    </>
  );
}
