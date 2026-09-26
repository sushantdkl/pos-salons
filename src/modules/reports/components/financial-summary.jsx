'use client';

import { money as formatCurrency } from '@/components/erp/tokens';

/**
 * The one financial summary block used by the Admin dashboard, the Cashier dashboard and
 * the Reports page, so all three always read the same server-calculated numbers under the
 * same labels. Every value arrives from getFinancialSummary() — nothing is derived here.
 */

// Same meaning-colours as the ERP kit: sales = emerald, collected = sky, out = rose, balance = indigo.
const GROUP_TONES = {
  inflow: { bar: 'bg-emerald-500', title: 'text-emerald-700', total: 'text-emerald-800' },
  online: { bar: 'bg-sky-500', title: 'text-sky-700', total: 'text-sky-800' },
  outflow: { bar: 'bg-rose-500', title: 'text-rose-700', total: 'text-rose-800' },
  ledger: { bar: 'bg-indigo-500', title: 'text-indigo-700', total: 'text-indigo-800' },
};

function Group({ title, rows, note, tone = 'ledger' }) {
  const t = GROUP_TONES[tone] || GROUP_TONES.ledger;
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} aria-hidden="true" />
      <h3 className={`text-xs font-bold uppercase tracking-wide ${t.title}`}>{title}</h3>
      <dl className="mt-3 divide-y divide-gray-100">
        {rows.map(([label, value, emphasis]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className={`text-sm ${emphasis ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</dt>
            <dd className={`whitespace-nowrap text-right text-sm tabular-nums ${
              emphasis ? `font-bold ${t.total}` : 'font-semibold text-gray-800'
            }`}>
              {formatCurrency(value)}
            </dd>
          </div>
        ))}
      </dl>
      {note ? <p className="mt-3 border-t border-gray-100 pt-3 text-[11px] leading-4 text-gray-500">{note}</p> : null}
    </div>
  );
}

export default function FinancialSummary({ financial, showSalary = true, className = '' }) {
  if (!financial) {
    return (
      <div className={`mb-6 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500 ${className}`}>
        Loading the financial summary…
      </div>
    );
  }

  const outflowRows = [
    ['Operating Expenses', financial.operatingExpenses],
    ...(showSalary && Number(financial.salaryExpenses || 0) > 0
      ? [['Salary Expenses', financial.salaryExpenses]]
      : []),
    ['Savings Transfers', financial.savingsTransfers],
  ];

  return (
    <section className={`mb-6 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-950">Financial Summary</h2>
        <p className="text-sm text-gray-500">
          {financial.period?.label}
          {financial.period?.displayRange ? ` · ${financial.period.displayRange}` : ''}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Group
          title="Sales"
          tone="inflow"
          rows={[
            ['Gross Sales Before Discount', financial.grossSalesBeforeDiscount],
            ['Total Discounts', financial.totalDiscounts],
            ['Net Sales After Discount', financial.netSalesAfterDiscount, true],
          ]}
        />
        <Group
          title="Payment"
          tone="online"
          rows={[
            ['Gross Cash Collected', financial.grossCashCollected],
            ['Gross QR Collected', financial.grossQrCollected],
            ['Gross Total Collected', financial.grossTotalCollected, true],
          ]}
        />
        <Group
          title="Outflows"
          tone="outflow"
          rows={outflowRows}
          note="Savings transfers move money between the salon's own accounts. They reduce available balances but are never counted as an operating expense."
        />
        <Group
          title="Available"
          tone="ledger"
          rows={[
            ['Net Cash Collections', financial.netCashInHand],
            ['Net Online Balance', financial.netOnlineBalance],
            ['Net Available Balance', financial.netAvailableBalance, true],
          ]}
        />
      </div>
    </section>
  );
}
