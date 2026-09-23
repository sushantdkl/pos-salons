'use client';

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, Send } from 'lucide-react';
import { activeServiceStaffFilter } from '@/lib/staff/service-staff';
import { buildReminderMessage, buildWhatsAppUrl, formatWhatsAppNumber, whatsAppBlockReason } from '@/lib/messaging/whatsapp';

export default function RemindersPage() {
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [staffName, setStaffName] = useState('');
  const [error, setError] = useState('');

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

  const loadData = async () => {
    const [customerResponse, serviceResponse, staffResponse] = await Promise.all([
      fetch('/api/admin/customers', { headers: headers() }),
      fetch('/api/admin/services', { headers: headers() }),
      fetch('/api/admin/employees', { headers: headers() })
    ]);
    if (customerResponse.ok) setCustomers((await customerResponse.json()).customers || []);
    if (serviceResponse.ok) setServices((await serviceResponse.json()).services || []);
    if (staffResponse.ok) setStaff(((await staffResponse.json()).employees || []).filter(activeServiceStaffFilter));
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCustomers = useMemo(() => customers.filter((customer) =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.includes(searchTerm)
  ), [customers, searchTerm]);

  // wa.me needs the full international number. The URL is built by the shared helper so the
  // country code can never be dropped again — a bare 10-digit link is rejected by WhatsApp.
  const sendReminder = (customer) => {
    const blocked = whatsAppBlockReason(customer.phone);
    if (blocked) {
      setError(`${customer.name}: ${blocked}. Update the customer record before sending a reminder.`);
      return;
    }
    setError('');
    const url = buildWhatsAppUrl(
      customer.phone,
      buildReminderMessage({ customerName: customer.name, serviceName, staffName })
    );
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">Reminders</h1>
            <p className="mt-1 text-sm text-gray-600">Send manual WhatsApp reminders using saved customer phone numbers.</p>
          </div>
          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

          <div className="mb-6 grid gap-4 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search customers by name or phone" className="w-full rounded-lg border border-gray-300 py-3 pl-10 pr-4 text-gray-950" />
            </div>
            <select value={serviceName} onChange={(e) => setServiceName(e.target.value)} className="rounded-lg border border-gray-300 px-4 py-3 text-gray-950">
              <option value="">Any service</option>
              {services.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
            </select>
            <select value={staffName} onChange={(e) => setStaffName(e.target.value)} className="rounded-lg border border-gray-300 px-4 py-3 text-gray-950">
              <option value="">Any stylist</option>
              {staff.map((member) => <option key={member.id} value={member.full_name}>{member.full_name}</option>)}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCustomers.map((customer) => (
              <div key={customer.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-950">{customer.name}</h2>
                    <p className="mt-1 text-sm text-gray-600">{formatWhatsAppNumber(customer.phone) || customer.phone || 'No phone saved'}</p>
                    {whatsAppBlockReason(customer.phone) ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">{whatsAppBlockReason(customer.phone)}</p>
                    ) : null}
                    {customer.favorite_services && <p className="mt-2 text-sm text-gray-500">Likes {customer.favorite_services}</p>}
                  </div>
                  <MessageCircle className="h-6 w-6 text-green-600" />
                </div>
                <button onClick={() => sendReminder(customer)} disabled={Boolean(whatsAppBlockReason(customer.phone))} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                  <Send className="h-4 w-4" />
                  Send WhatsApp Reminder
                </button>
              </div>
            ))}
            {filteredCustomers.length === 0 && (
              <div className="col-span-full rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
                No customers found.
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
