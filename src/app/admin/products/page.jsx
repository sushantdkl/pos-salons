'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/dashboard-layout';
import { Clock, Edit, Plus, Search, Scissors, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const CATEGORIES = ['Haircut', 'Hair Color', 'Facial', 'Beard', 'Treatment', 'Makeup', 'Spa', 'Other'];
const emptyForm = {
  name: '',
  category: 'Haircut',
  price: '',
  duration_minutes: '',
  assigned_staff_ids: [],
  description: '',
  is_active: true
};

export default function ServicesPage() {
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const tokenHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

  const fetchServices = async () => {
    setLoading(true);
    const response = await fetch('/api/admin/services', { headers: tokenHeaders() });
    if (response.ok) {
      const data = await response.json();
      setServices(data.services || []);
    }
    setLoading(false);
  };

  const fetchStaff = async () => {
    const response = await fetch('/api/admin/employees', { headers: tokenHeaders() });
    if (response.ok) {
      const data = await response.json();
      setStaff((data.employees || []).filter((employee) => employee.is_active));
    }
  };

  useEffect(() => {
    fetchServices();
    fetchStaff();
  }, []);

  const filteredServices = useMemo(() => services.filter((service) => {
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase())
      || service.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || service.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }), [services, searchTerm, categoryFilter]);

  const openForm = (service = null) => {
    setError('');
    setEditingService(service);
    setFormData(service ? {
      name: service.name || '',
      category: service.category || 'Haircut',
      price: service.price || '',
      duration_minutes: service.duration_minutes || '',
      assigned_staff_ids: service.assigned_staff_ids ? service.assigned_staff_ids.split(',').filter(Boolean).map(Number) : [],
      description: service.description || '',
      is_active: !!service.is_active
    } : emptyForm);
    setShowForm(true);
  };

  const validate = () => {
    if (!formData.name.trim()) return 'Service name is required';
    if (!formData.category) return 'Category is required';
    if (Number(formData.price) < 0 || formData.price === '') return 'Price must be zero or greater';
    if (!Number.isInteger(Number(formData.duration_minutes)) || Number(formData.duration_minutes) <= 0) return 'Duration must be a positive whole number';
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const response = await fetch('/api/admin/services', {
      method: editingService ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...tokenHeaders() },
      body: JSON.stringify(editingService ? { ...formData, id: editingService.id } : formData)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not save service');
      return;
    }

    setShowForm(false);
    setEditingService(null);
    setFormData(emptyForm);
    fetchServices();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this service?')) return;
    const response = await fetch(`/api/admin/services?id=${id}`, {
      method: 'DELETE',
      headers: tokenHeaders()
    });
    if (response.ok) fetchServices();
  };

  const toggleStaff = (staffId) => {
    setFormData((current) => ({
      ...current,
      assigned_staff_ids: current.assigned_staff_ids.includes(staffId)
        ? current.assigned_staff_ids.filter((id) => id !== staffId)
        : [...current.assigned_staff_ids, staffId]
    }));
  };

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-950">Service Management</h1>
              <p className="mt-1 text-sm text-gray-600">Create salon services, assign stylists, and control availability.</p>
            </div>
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800">
              <Plus className="h-5 w-5" />
              Add Service
            </button>
          </div>

          <div className="mb-6 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search service name or description" className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900">
              <option value="all">All categories</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {loading ? (
              <div className="col-span-full rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">Loading services...</div>
            ) : filteredServices.length === 0 ? (
              <div className="col-span-full rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-600">No salon services found.</div>
            ) : filteredServices.map((service) => (
              <div key={service.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">{service.category}</div>
                    <h2 className="text-lg font-semibold text-gray-950">{service.name}</h2>
                    {service.description && <p className="mt-1 text-sm text-gray-600">{service.description}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${service.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {service.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Price</p>
                    <p className="font-semibold text-gray-950">{formatCurrency(service.price || 0)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">Duration</p>
                    <p className="flex items-center gap-1 font-semibold text-gray-950"><Clock className="h-4 w-4" />{service.duration_minutes} min</p>
                  </div>
                </div>
                <p className="mb-4 text-sm text-gray-600">Staff: {service.assigned_staff_names || 'Any available staff'}</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => openForm(service)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50" title="Edit service"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(service.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" title="Delete service"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-2xl font-semibold text-gray-950">{editingService ? 'Edit Service' : 'Add Service'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Service name *</span>
                  <input required value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Category *</span>
                  <select required value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900">
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Price *</span>
                  <input required type="number" min="0" step="0.01" value={formData.price} onChange={(event) => setFormData({ ...formData, price: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">Duration in minutes *</span>
                  <input required type="number" min="1" step="1" value={formData.duration_minutes} onChange={(event) => setFormData({ ...formData, duration_minutes: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
              </div>
              <div>
                <span className="mb-2 block text-sm font-medium text-gray-900">Assigned staff</span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {staff.map((employee) => (
                    <label key={employee.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">
                      <input type="checkbox" checked={formData.assigned_staff_ids.includes(employee.id)} onChange={() => toggleStaff(employee.id)} />
                      {employee.full_name}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Description</span>
                <textarea rows={3} value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <input type="checkbox" checked={formData.is_active} onChange={(event) => setFormData({ ...formData, is_active: event.target.checked })} />
                Service is active
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-gray-950 px-4 py-3 font-medium text-white hover:bg-gray-800">
                  <Scissors className="mr-2 inline h-4 w-4" />
                  {editingService ? 'Update Service' : 'Create Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
