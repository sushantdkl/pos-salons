'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Edit, Package, Plus, Search, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const emptyForm = {
  name: '',
  category: 'Shampoo',
  purchase_price: '',
  selling_price: '',
  current_stock: '',
  low_stock_threshold: '',
  supplier: '',
  expiry_date: '',
  status: 'active'
};

export default function SalonInventoryPage() {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [stockChange, setStockChange] = useState({ id: '', movement_type: 'stock_in', quantity: '', notes: '' });
  const [error, setError] = useState('');

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

  const fetchProducts = async () => {
    const response = await fetch('/api/admin/salon-products', { headers: headers() });
    if (response.ok) {
      const data = await response.json();
      setProducts(data.products || []);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filteredProducts = useMemo(() => products.filter((product) =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category.toLowerCase().includes(searchTerm.toLowerCase())
  ), [products, searchTerm]);

  const inventoryValue = products.reduce((sum, product) => sum + Number(product.stock_value || 0), 0);
  const lowStockCount = products.filter((product) => product.is_low_stock).length;

  const openForm = (product = null) => {
    setError('');
    setEditingProduct(product);
    setFormData(product ? {
      name: product.name,
      category: product.category,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      current_stock: product.current_stock,
      low_stock_threshold: product.low_stock_threshold,
      supplier: product.supplier || '',
      expiry_date: product.expiry_date || '',
      status: product.status
    } : emptyForm);
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/admin/salon-products', {
      method: editingProduct ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(editingProduct ? { ...formData, id: editingProduct.id } : formData)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not save product');
      return;
    }
    setShowForm(false);
    setEditingProduct(null);
    setFormData(emptyForm);
    fetchProducts();
  };

  const handleStockMovement = async (event) => {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/admin/salon-products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(stockChange)
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not update stock');
      return;
    }
    setStockChange({ id: '', movement_type: 'stock_in', quantity: '', notes: '' });
    fetchProducts();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    const response = await fetch(`/api/admin/salon-products?id=${id}`, { method: 'DELETE', headers: headers() });
    if (response.ok) fetchProducts();
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-950">Salon Product Inventory</h1>
              <p className="mt-1 text-sm text-gray-600">Track retail and consumable salon stock without allowing negative quantities.</p>
            </div>
            <button onClick={() => openForm()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 py-3 font-medium text-white hover:bg-gray-800">
              <Plus className="h-5 w-5" />
              Add Product
            </button>
          </div>

          {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Inventory valuation</p>
              <p className="mt-1 text-2xl font-semibold text-gray-950">{formatCurrency(inventoryValue)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-500">Low stock products</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{lowStockCount}</p>
            </div>
            <form onSubmit={handleStockMovement} className="rounded-lg border border-gray-200 bg-white p-5">
              <p className="mb-3 text-sm font-semibold text-gray-900">Stock in / stock out</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <select required value={stockChange.id} onChange={(event) => setStockChange({ ...stockChange, id: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-950">
                  <option value="">Product</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
                <select value={stockChange.movement_type} onChange={(event) => setStockChange({ ...stockChange, movement_type: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-950">
                  <option value="stock_in">Stock in</option>
                  <option value="stock_out">Stock out</option>
                  <option value="adjustment">Adjustment in</option>
                </select>
                <input required type="number" min="1" placeholder="Qty" value={stockChange.quantity} onChange={(event) => setStockChange({ ...stockChange, quantity: event.target.value })} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-950" />
                <button className="rounded-lg bg-gray-950 px-4 py-2 font-medium text-white hover:bg-gray-800">Save</button>
              </div>
            </form>
          </div>

          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search products by name or category" className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Stock</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Buy</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Sell</th>
                  <th className="px-5 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-5 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-950">
                      <div className="flex items-center gap-2">
                        {product.is_low_stock ? <AlertTriangle className="h-4 w-4 text-red-500" /> : <Package className="h-4 w-4 text-gray-400" />}
                        {product.name}
                      </div>
                      {product.supplier && <p className="mt-1 text-xs text-gray-500">{product.supplier}</p>}
                    </td>
                    <td className="px-5 py-4 text-gray-700">{product.category}</td>
                    <td className={`px-5 py-4 text-right font-semibold ${product.is_low_stock ? 'text-red-600' : 'text-gray-950'}`}>{product.current_stock}</td>
                    <td className="px-5 py-4 text-right text-gray-700">{formatCurrency(product.purchase_price)}</td>
                    <td className="px-5 py-4 text-right font-medium text-gray-950">{formatCurrency(product.selling_price)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{product.status}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openForm(product)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(product.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredProducts.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <p className="font-medium text-gray-700">No inventory items added yet.</p>
                <p className="mt-1 text-sm">Salon products and stock levels will appear here once inventory is added.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-white">
            <div className="border-b border-gray-200 p-6">
              <h2 className="text-2xl font-semibold text-gray-950">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
            </div>
            <form onSubmit={handleSubmit} className="grid gap-4 p-6 md:grid-cols-2">
              {['name', 'category', 'supplier'].map((field) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-sm font-medium capitalize text-gray-900">{field.replace('_', ' ')}{field !== 'supplier' ? ' *' : ''}</span>
                  <input required={field !== 'supplier'} value={formData[field]} onChange={(event) => setFormData({ ...formData, [field]: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
              ))}
              {[
                ['purchase_price', 'Purchase price'],
                ['selling_price', 'Selling price'],
                ['current_stock', 'Current stock'],
                ['low_stock_threshold', 'Low stock threshold']
              ].map(([field, label]) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-900">{label} *</span>
                  <input required type="number" min="0" step={field.includes('price') ? '0.01' : '1'} value={formData[field]} onChange={(event) => setFormData({ ...formData, [field]: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
              ))}
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Expiry date</span>
                <input type="date" value={formData.expiry_date} onChange={(event) => setFormData({ ...formData, expiry_date: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-900">Status</span>
                <select value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })} className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-950 outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <div className="flex gap-3 md:col-span-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 rounded-lg bg-gray-950 px-4 py-3 font-medium text-white hover:bg-gray-800">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
