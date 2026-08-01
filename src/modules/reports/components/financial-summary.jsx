'use client';

import { formatCurrency } from '@/lib/currency';

/**
 * The one financial summary block used by the Admin dashboard, the Cashier dashboard and
 * the Reports page, so all three always read the same server-calculated numbers under the
 * same labels. Every value arrives from getFinancialSummary() — nothing is derived here.
 */

function Group({ title, rows, note }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <dl className="mt-3 divide-y divide-gray-100">
        {rows.map(([label, value, emphasis]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className={`text-sm ${emphasis ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{label}</dt>
            <dd className={`whitespace-nowrap text-right text-sm tabular-nums ${
              emphasis ? 'font-bold text-gray-950' : 'font-semibold text-gray-800'
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
          rows={[
            ['Gross Sales Before Discount', financial.grossSalesBeforeDiscount],
            ['Total Discounts', financial.totalDiscounts],
            ['Net Sales After Discount', financial.netSalesAfterDiscount, true],
          ]}
        />
        <Group
          title="Payment"
          rows={[
            ['Gross Cash Collected', financial.grossCashCollected],
            ['Gross QR Collected', financial.grossQrCollected],
            ['Gross Total Collected', financial.grossTotalCollected, true],
          ]}
        />
        <Group
          title="Outflows"
          rows={outflowRows}
          note="Savings transfers move money between the salon's own accounts. They reduce available balances but are never counted as an operating expense."
        />
        <Group
          title="Available"
          rows={[
            ['Net Cash in Hand', financial.netCashInHand],
            ['Net Online Balance', financial.netOnlineBalance],
            ['Net Available Balance', financial.netAvailableBalance, true],
          ]}
        />
      </div>
    </section>
  );
}
