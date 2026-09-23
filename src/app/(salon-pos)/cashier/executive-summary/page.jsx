'use client';

/**
 * CASHIER → EXECUTIVE SUMMARY
 *
 * The same report as the admin Executive Summary, rendered from the same shared components
 * and the same server payload, restricted to front-desk data. Management sections (salary,
 * commission, P&L, inventory purchases, staff performance) are not requested and are not
 * present in the cashier API response at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency } from '@/lib/currency';
import {
  Card, CashInHandCard, CategoryRow, Empty, ImpactBlock, Note, PaymentReceivedCard,
  PERIOD_TABS, ProductCategoryCard, ReportControls, ReportSheet, Row, SavingsCard,
  ServiceCategoryCard, TokenCard, Total, getTodayIso, isValidRange, num,
} from '@/components/reports/executive-report';

export default function CashierExecutiveSummaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryPeriod = searchParams.get('period');
  const normalizedQueryPeriod = queryPeriod === 'week' ? '7days' : queryPeriod;
  const validPeriods = useMemo(() => PERIOD_TABS.map((option) => option.value), []);
  const todayIso = getTodayIso();

  const [period, setPeriod] = useState(validPeriods.includes(normalizedQueryPeriod) ? normalizedQueryPeriod : 'today');
  const [customRange, setCustomRange] = useState({
    start: searchParams.get('startDate') || '',
    end: searchParams.get('endDate') || '',
  });
  // Only an applied, valid range triggers a fetch — typing in the date inputs must not.
  const [appliedRange, setAppliedRange] = useState(() => (
    normalizedQueryPeriod === 'custom' && isValidRange(searchParams.get('startDate'), searchParams.get('endDate'))
      ? { start: searchParams.get('startDate'), end: searchParams.get('endDate') }
      : { start: '', end: '' }
  ));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const customQuery = period === 'custom' && isValidRange(appliedRange.start, appliedRange.end)
    ? `&startDate=${appliedRange.start}&endDate=${appliedRange.end}`
    : '';

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(`/api/cashier/executive-summary?period=${period}${customQuery}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load the executive summary');
      setSummary(payload.summary);
    } catch (err) {
      setError(err.message || 'Unable to load the executive summary');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customQuery]);

  useEffect(() => { load(); }, [load]);

  const changePeriod = (next) => {
    setPeriod(next);
    if (next !== 'custom') router.replace(`/cashier/executive-summary?period=${next}`, { scroll: false });
  };

  const applyCustom = () => {
    if (!isValidRange(customRange.start, customRange.end)) return;
    setAppliedRange({ start: customRange.start, end: customRange.end });
    router.replace(`/cashier/executive-summary?period=custom&startDate=${customRange.start}&endDate=${customRange.end}`, { scroll: false });
  };

  const revenue = summary?.revenue;
  const payments = summary?.payments;
  const expenses = summary?.expenses;
  const savings = summary?.savings;
  const cash = summary?.cashPosition;
  const online = summary?.onlinePosition;
  const tokens = summary?.tokens;
  const quantities = summary?.quantities;

  return (
    <div className="min-h-screen px-3 py-4 sm:px-5 lg:py-6" style={{ background: '#f4f2ef' }}>
      <ReportControls
        period={period}
        onChangePeriod={changePeriod}
        customRange={customRange}
        onCustomChange={setCustomRange}
        onApplyCustom={applyCustom}
        todayIso={todayIso}
        onPrint={() => window.print()}
        onRefresh={() => load({ quiet: true })}
        refreshing={refreshing}
        error={error}
      />

      <ReportSheet title="Cashier Executive Summary" summary={summary} loading={loading}>
        {summary ? (
          <>
            {/* Row 1 */}
            <Card title="Sales Recorded">
              <Row label="Service Sales" value={formatCurrency(revenue.serviceRevenue)} />
              <Row label="Product Sales" value={formatCurrency(revenue.productRevenue)} />
              <Row label="Gross Sales" value={formatCurrency(revenue.grossSalesBeforeDiscount)} />
              <Row label="Discounts Given" value={formatCurrency(revenue.totalDiscounts)} sign="- " />
              <Total label="Net Sales" value={formatCurrency(revenue.netSales)} />
            </Card>

            <Card title="Bills &amp; Customers">
              <Row label="Completed Bills" value={revenue.bills} />
              <Row label="Average Bill" value={formatCurrency(revenue.avgBill)} />
              <Row label="Customers Served" value={quantities.uniqueCustomers} />
              <Row label="Services Sold" value={quantities.servicesSold} />
              <Row label="Products Sold" value={quantities.productsSold} />
              <Row label="Cancelled Bills" value={quantities.cancelledBills} muted />
              <Total label="Token / Direct Bills" value={`${quantities.tokenBills} / ${quantities.directBills}`} />
            </Card>

            {/* Row 2 — identical component and payload fields as the admin report */}
            <PaymentReceivedCard payments={payments} />

            <Card title="Operating Expenses">
              <Row label="Cash" value={formatCurrency(expenses.cash)} />
              <Row label="Online / Bank Transfer" value={formatCurrency(expenses.online)} />
              <Row label="Expense Records" value={expenses.records} muted />
              <Total label="Total Expense" value={formatCurrency(expenses.total)} />
              <Note>Salary and payroll are management records and are not included here or in this total.</Note>
            </Card>

            {/* Row 3 */}
            <Card title="Cash Register">
              <Row label="Cash In" value={formatCurrency(cash.cashCollected)} />
              <Row label="Cash Out" value={formatCurrency(cash.cashPaidOut)} />
              <Row label="Deposit" value={formatCurrency(cash.cashSavings)} />
              <Total label="Net Cash Collections" value={formatCurrency(cash.netCashMovement)} />
              <Note>This is the period cash movement, not the drawer balance. The drawer position is Expected Cash in Drawer.</Note>
            </Card>

            <SavingsCard savings={savings} />

            {/* Row 4 — the drawer reconciliation, shared with the admin report */}
            <CashInHandCard cash={cash} />

            <Card title="Online / QR Position">
              <Row label="Esewa / PhonePay" value={formatCurrency(online.esewaPhonePay)} sign="+ " />
              <Row label="Bank QR" value={formatCurrency(online.bankQr)} sign="+ " />
              <Row label="Online Paid Out" value={formatCurrency(online.onlinePaidOut)} sign="- " />
              <Row label="Savings Transfers" value={formatCurrency(online.onlineSavings)} sign="- " />
              <Total label="Net Online / Bank Balance" value={formatCurrency(online.netOnlineBalance)} />
              <Note>QR and online money never forms part of the physical drawer.</Note>
            </Card>

            {/* Row 5 */}
            <ServiceCategoryCard categories={summary.serviceCategories} />
            <ProductCategoryCard categories={summary.productCategories} />

            {/* Row 6 */}
            <TokenCard tokens={tokens} directBills={quantities.directBills} />

            <Card title="Collected This Period">
              <ImpactBlock
                caption="Total Collected"
                value={formatCurrency(payments.grossTotalCollected)}
                footnote="Cash plus online / QR received against bills"
                positive={num(payments.grossTotalCollected) >= 0}
              />
            </Card>

            {/* Row 7 */}
            <Card title="Activity Summary">
              <Row label="Services Sold" value={quantities.servicesSold} />
              <Row label="Products Sold" value={quantities.productsSold} />
              <Row label="Bills" value={quantities.bills} />
              <Row label="Customers Served" value={quantities.uniqueCustomers} />
              <Row label="New Customers" value={quantities.newCustomers} />
              <Row label="Tokens Generated" value={quantities.tokensGenerated} />
              <Row label="Token Conversions" value={quantities.tokenConversions} />
              <Row label="Expense Records" value={quantities.expenseRecords} />
              <Row label="Savings Records" value={quantities.savingsRecords} />
              <Row label="Store Sessions" value={quantities.storeSessions} />
            </Card>

            <Card title="Top Services">
              {summary.serviceCategories.length === 0 ? (
                <Empty>No service sales for this period</Empty>
              ) : summary.serviceCategories.slice(0, 6).map((row) => (
                <CategoryRow key={row.category} name={row.category} quantity={row.quantity} amount={row.revenue} />
              ))}
              <Note>Salary, commission and profit figures are management information and are not part of this report.</Note>
            </Card>
          </>
        ) : null}
      </ReportSheet>
    </div>
  );
}
