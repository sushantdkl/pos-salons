'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Printer, RefreshCw, Ticket, UserCheck, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

const statusStyles = {
  WAITING: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200',
  BILLED: 'bg-gray-900 text-white',
  CANCELLED: 'bg-red-100 text-red-800 ring-1 ring-red-200',
  NO_SHOW: 'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
};

function headers() {
  return { Authorization: `Bearer ${localStorage.getItem('pos_token')}` };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function printToken(token, printWindow = window.open('', '', 'width=340,height=620')) {
  if (!printWindow) return;
  printWindow.document.write(`
    <html><head><title>${token.token_number}</title><style>
      body{font-family:Courier New,monospace;width:72mm;margin:0 auto;padding:10px;font-size:12px;color:#111}
      h1{text-align:center;font-size:16px;margin:0 0 4px}.token{text-align:center;font-size:28px;font-weight:bold;border:1px dashed #111;padding:10px;margin:8px 0}
      .row{display:flex;justify-content:space-between;border-bottom:1px dotted #ccc;padding:4px 0}.center{text-align:center;margin-top:10px}
    </style></head><body>
      <h1>The Hair Cut</h1>
      <div class="center">Walk-In Token</div>
      <div class="token">${token.token_number}</div>
      <div class="row"><span>Service</span><strong>${token.service_name}</strong></div>
      ${token.customer_name ? `<div class="row"><span>Name</span><strong>${token.customer_name}</strong></div>` : ''}
      ${token.customer_phone ? `<div class="row"><span>Phone</span><strong>${token.customer_phone}</strong></div>` : ''}
      ${token.staff_name ? `<div class="row"><span>Staff</span><strong>${token.staff_name}</strong></div>` : ''}
      <div class="row"><span>People ahead</span><strong>${token.people_ahead}</strong></div>
      <div class="row"><span>Wait</span><strong>${token.wait_label}</strong></div>
      <div class="row"><span>Created</span><strong>${new Date(token.created_at).toLocaleString()}</strong></div>
      <div class="center">Please wait for your turn</div>
      <div class="center">WhatsApp: +977 9858051694</div>
    </body></html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function AnalyticsPanel({ analytics }) {
  const groups = [
    {
      title: 'Queue',
      items: [
        ['Waiting', analytics.summary?.waiting || 0, true],
        ['Cancelled', analytics.summary?.cancelled || 0, false],
        ['No-show', analytics.summary?.noShow || 0, false],
      ],
    },
    {
      title: 'Tokens',
      items: [
        ['Generated', analytics.summary?.generated || 0, false],
        ['Digital', analytics.summary?.digitalTokens || 0, false],
        ['Printed', analytics.summary?.printedTokens || 0, false],
      ],
    },
    {
      title: 'Bills',
      items: [
        ['Completed', analytics.bills?.totalBills || 0, false],
        ['Digital', analytics.bills?.digitalBills || 0, false],
        ['Printed', analytics.bills?.printedBills || 0, false],
        ['Without token', analytics.bills?.directBills || 0, false],
      ],
    },
  ];

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Ticket className="h-5 w-5 text-amber-700" />
        <h2 className="text-base font-semibold text-gray-950">Today&apos;s summary</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.title} className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</p>
            <dl className="space-y-2">
              {group.items.map(([label, value, highlight]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-sm text-gray-600">{label}</dt>
                  <dd className={`text-sm font-semibold ${highlight && Number(value) > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TokenDashboard({ mode = 'cashier', staffRole = '' }) {
  const router = useRouter();
  const canCreate = mode === 'cashier' || mode === 'admin';
  const canAudit = mode === 'admin';
  const isStaffQueue = mode === 'staff';
  const [tokens, setTokens] = useState([]);
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [date, setDate] = useState(today());
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastToken, setLastToken] = useState(null);
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    service_id: '',
    assigned_staff_id: '',
    notes: '',
  });

  const waitingTokens = useMemo(() => tokens.filter((token) => token.status === 'WAITING'), [tokens]);

  const fetchTokens = async () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (status) params.set('status', status);
    const response = await fetch(`/api/admin/tokens?${params.toString()}`, { headers: headers() });
    const data = await response.json();
    if (response.ok) setTokens(data.tokens || []);
    else setError(data.error || 'Could not load tokens');
    setLoading(false);
  };

  const fetchAnalytics = async () => {
    if (!canAudit) return;
    const response = await fetch(`/api/admin/tokens?mode=analytics&date=${date}`, { headers: headers() });
    const data = await response.json();
    if (response.ok) setAnalytics(data);
  };

  const fetchLookups = async () => {
    const [serviceResponse, staffResponse] = await Promise.all([
      fetch('/api/admin/services', { headers: headers() }),
      fetch('/api/admin/employees', { headers: headers() }),
    ]);
    if (serviceResponse.ok) setServices((await serviceResponse.json()).services?.filter((service) => service.is_active) || []);
    if (staffResponse.ok) setStaff((await staffResponse.json()).employees?.filter((employee) =>
      employee.is_active && ['barber', 'stylist', 'beautician'].includes(employee.salon_role)
    ) || []);
  };

  useEffect(() => {
    fetchLookups();
  }, []);

  useEffect(() => {
    fetchTokens();
    fetchAnalytics();
  }, [date, status]);

  const createToken = async (shouldPrint = false) => {
    setError('');
    if (!form.service_id) {
      setError('Select a service or package.');
      return;
    }
    const printWindow = shouldPrint ? window.open('', '', 'width=340,height=620') : null;
    const response = await fetch('/api/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ ...form, should_print: shouldPrint }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (printWindow) printWindow.close();
      setError(data.error || 'Could not create token');
      return;
    }
    setLastToken(data.token);
    setForm({ customer_name: '', customer_phone: '', service_id: '', assigned_staff_id: '', notes: '' });
    if (shouldPrint) printToken(data.token, printWindow);
    fetchTokens();
    fetchAnalytics();
  };

  const updateToken = async (token, action) => {
    setError('');
    const response = await fetch('/api/admin/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ id: token.id, action }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not update token');
      return null;
    }
    fetchTokens();
    fetchAnalytics();
    return data.token;
  };

  const printExistingToken = async (token) => {
    const printWindow = window.open('', '', 'width=340,height=620');
    const updated = await updateToken(token, 'print');
    if (!updated && printWindow) printWindow.close();
    else printToken(updated || token, printWindow);
  };

  const assignStaff = async (token, staffId) => {
    setError('');
    const response = await fetch('/api/admin/tokens', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ id: token.id, action: 'assign', assigned_staff_id: staffId || null }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Could not assign staff');
      return;
    }
    fetchTokens();
  };

  const convertToBill = (token) => {
    const params = new URLSearchParams({ tokenId: String(token.id) });
    router.push(`/admin/billing?${params.toString()}`);
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-950 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200';

  return (
    <>
      <header className="border-b border-gray-200 bg-white px-6 py-5 sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-950 sm:text-3xl">
              {isStaffQueue ? `${staffRole || 'Staff'} Queue` : 'Walk-In Tokens'}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {isStaffQueue ? 'Customers assigned to you today.' : 'Generate tokens and convert them to bills.'}
            </p>
          </div>
          <button
            onClick={() => { fetchTokens(); fetchAnalytics(); }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </header>

      <div className="bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {canAudit && analytics ? (
            <>
              <AnalyticsPanel analytics={analytics} />
              {analytics.warnings?.length ? (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {analytics.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              ) : null}
            </>
          ) : null}

          <div className={`grid gap-6 ${canCreate ? 'xl:grid-cols-[380px_1fr]' : ''}`}>
            {canCreate ? (
              <section className="h-fit rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-gray-950">New token</h2>
                <div className="space-y-3">
                  <input
                    value={form.customer_name}
                    onChange={(event) => setForm({ ...form, customer_name: event.target.value })}
                    placeholder="Customer name (optional)"
                    className={inputClass}
                  />
                  <input
                    value={form.customer_phone}
                    onChange={(event) => setForm({ ...form, customer_phone: event.target.value })}
                    placeholder="Phone (optional)"
                    className={inputClass}
                  />
                  <select
                    value={form.service_id}
                    onChange={(event) => setForm({ ...form, service_id: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select service or package</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} · {service.duration_minutes} min · {formatCurrency(service.price)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.assigned_staff_id}
                    onChange={(event) => setForm({ ...form, assigned_staff_id: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Preferred staff (optional)</option>
                    {staff.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name} ({employee.salon_role})
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    placeholder="Notes (optional)"
                    rows={2}
                    className={inputClass}
                  />
                  <div className="grid gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => createToken(false)}
                      className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                    >
                      Generate token
                    </button>
                    <button
                      type="button"
                      onClick={() => createToken(true)}
                      className="rounded-lg border border-green-600 bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
                    >
                      Generate &amp; print
                    </button>
                  </div>
                </div>
                {lastToken ? (
                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Token created</p>
                    <p className="mt-1 text-2xl font-bold text-green-900">{lastToken.token_number}</p>
                    <p className="mt-1 text-sm text-green-800">
                      {lastToken.people_ahead} ahead · est. wait {lastToken.wait_label}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    {isStaffQueue ? 'Your queue' : 'Queue'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {waitingTokens.length} waiting · {tokens.length} total
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {!isStaffQueue ? (
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">All statuses</option>
                      {['WAITING', 'BILLED', 'CANCELLED', 'NO_SHOW'].map((item) => (
                        <option key={item} value={item}>{item.replace('_', ' ')}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>

              <div className="p-5">
                {loading ? (
                  <div className="rounded-lg bg-gray-50 py-12 text-center text-sm text-gray-500">Loading queue…</div>
                ) : null}
                {!loading && tokens.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 py-12 text-center text-sm text-gray-500">No tokens for this date.</div>
                ) : null}

                <div className="space-y-3">
                  {tokens.map((token) => (
                    <article
                      key={token.id}
                      className={`rounded-lg border p-4 transition ${
                        token.status === 'WAITING' ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50/60'
                      }`}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-mono text-xl font-bold tracking-tight text-gray-950">{token.token_number}</p>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyles[token.status] || 'bg-gray-100 text-gray-700'}`}>
                              {token.status_label}
                            </span>
                            {token.status === 'WAITING' ? (
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${token.is_printed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                {token.is_printed ? 'Printed' : 'Digital'}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 font-medium text-gray-900">{token.service_name}</p>
                          <p className="text-sm text-gray-600">
                            {token.customer_name || 'Walk-in customer'}
                            {token.customer_phone ? ` · ${token.customer_phone}` : ''}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <UserCheck className="h-3.5 w-3.5" />
                              {token.staff_name || 'Unassigned'}
                            </span>
                            {token.status === 'WAITING' ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {token.people_ahead} ahead · {token.wait_label}
                              </span>
                            ) : null}
                            <span>{new Date(token.created_at).toLocaleString()}</span>
                          </div>
                          {canCreate && token.status === 'WAITING' ? (
                            <select
                              value={token.assigned_staff_id || ''}
                              onChange={(event) => assignStaff(token, event.target.value)}
                              className="mt-3 max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-950"
                            >
                              <option value="">Assign staff</option>
                              {staff.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  {employee.full_name} ({employee.salon_role})
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>

                        {canCreate && token.status === 'WAITING' ? (
                          <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                            <button
                              onClick={() => convertToBill(token)}
                              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
                            >
                              Convert to bill
                            </button>
                            <button
                              onClick={() => printExistingToken(token)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                            >
                              <Printer className="h-4 w-4" /> Print
                            </button>
                            <div className="flex gap-2 lg:contents">
                              <button
                                onClick={() => updateToken(token, 'cancel')}
                                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 lg:flex-none"
                              >
                                <XCircle className="h-4 w-4" /> Cancel
                              </button>
                              <button
                                onClick={() => updateToken(token, 'no_show')}
                                className="flex-1 rounded-lg border border-orange-200 px-3 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 lg:flex-none"
                              >
                                No-show
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
