'use client';

/**
 * ADMIN → EXECUTIVE SUMMARY
 *
 * A printed-statement style report: one narrow, centred white sheet holding a two-column
 * grid of compact bordered accounting cards. Every number comes from the single grouped
 * /api/admin/executive-summary payload — this page performs no money maths beyond
 * formatting, so it can never disagree with the dashboards or the reports.
 *
 * The card primitives are shared with the Cashier Executive Summary so the two reports
 * cannot drift apart visually or numerically.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatCurrency } from '@/lib/currency';
import {
  Card, CashInHandCard, CategoryRow, Empty, ImpactBlock, Note, PaymentReceivedCard,
  PERIOD_TABS, ProductCategoryCard, ReportControls, ReportSheet, Row, SavingsCard,
  ServiceCategoryCard, TokenCard, Total, getTodayIso, isValidRange, num,
} from '@/components/reports/executive-report';

export default function ExecutiveSummaryPage() {
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
      const response = await fetch(`/api/admin/executive-summary?period=${period}${customQuery}`, {
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
    if (next !== 'custom') router.replace(`/admin/executive-summary?period=${next}`, { scroll: false });
  };

  const applyCustom = () => {
    if (!isValidRange(customRange.start, customRange.end)) return;
    setAppliedRange({ start: customRange.start, end: customRange.end });
    router.replace(`/admin/executive-summary?period=custom&startDate=${customRange.start}&endDate=${customRange.end}`, { scroll: false });
  };

  const revenue = summary?.revenue;
  const payments = summary?.payments;
  const expenses = summary?.expenses;
  const salary = summary?.salary;
  const savings = summary?.savings;
  const purchases = summary?.purchases;
  const pnl = summary?.profitLoss;
  const cash = summary?.cashPosition;
  const online = summary?.onlinePosition;
  const tokens = summary?.tokens;
  const quantities = summary?.quantities;
  const kpis = summary?.executiveKpis;

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

      <ReportSheet title="Executive Summary" summary={summary} loading={loading}>
        {summary ? (
          <>
            {/* Row 1 */}
            <Card title="Salon Revenue">
              <Row label="Service Revenue" value={formatCurrency(revenue.serviceRevenue)} />
              <Row label="Product Revenue" value={formatCurrency(revenue.productRevenue)} />
              <Row label="Tax / Service Charge" value={formatCurrency(num(revenue.totalTax) + num(revenue.totalServiceCharge))} />
              <Total label="Total Revenue" value={formatCurrency(revenue.netSales)} />
            </Card>

            <Card title="Discounts &amp; Net Sales">
              <Row label="Gross Sales" value={formatCurrency(revenue.grossSalesBeforeDiscount)} />
              <Row label="Discounts Given" value={formatCurrency(revenue.totalDiscounts)} sign="- " />
              <Row label="Completed Bills" value={revenue.bills} />
              <Row label="Average Bill" value={formatCurrency(revenue.avgBill)} />
              <Total label="Net Sales" value={formatCurrency(revenue.netSales)} />
              <Note>Customer credit sales and ledger collections are not implemented in this POS.</Note>
            </Card>

            {/* Row 2 */}
            <PaymentReceivedCard payments={payments} />

            <Card title="Inventory Purchase">
              <Row label="Cash" value={formatCurrency(purchases.cashPurchase)} />
              <Row label="Bank / Online Transfer" value={formatCurrency(purchases.onlinePurchase)} />
              <Row label="Units Restocked" value={purchases.unitsRestocked} muted />
              <Total label="Total Purchase" value={formatCurrency(purchases.totalPurchase)} />
              <Note>Supplier credit is not tracked. Purchases are recognised when the payment is recorded and are already inside Total Expense.</Note>
            </Card>

            {/* Row 3 */}
            <Card title="Total Expense">
              <Row label="Cash" value={formatCurrency(expenses.cash)} />
              <Row label="Online / Bank Transfer" value={formatCurrency(expenses.online)} />
              <Row label="Expense Records" value={expenses.records} muted />
              <Total label="Total Expense" value={formatCurrency(expenses.total)} />
            </Card>

            <Card title="Total Salary Paid">
              <Row label="Cash" value={formatCurrency(salary.totalCash)} />
              <Row label="Online / Bank Transfer" value={formatCurrency(salary.totalOnline)} />
              <Row label="Commission Paid" value={formatCurrency(salary.commissionPaid)} muted />
              <Total label="Total Salary" value={formatCurrency(salary.totalPaid)} />
              <Note>Commission accrued this period: {formatCurrency(salary.commissionAccrued)} — not an expense until paid.</Note>
            </Card>

            {/* Row 4 */}
            <Card title="Cash Register">
              <Row label="Cash In" value={formatCurrency(cash.cashCollected)} />
              <Row label="Cash Out" value={formatCurrency(cash.cashPaidOut)} />
              <Row label="Deposit" value={formatCurrency(cash.cashSavings)} />
              <Total label="Net Cash Collections" value={formatCurrency(cash.netCashMovement)} />
              <Note>Period cash movement, not the drawer balance. The drawer position is Expected Cash in Drawer.</Note>
            </Card>

            <SavingsCard savings={savings} />

            {/* Row 5 */}
            <Card title="Profit &amp; Loss">
              <Row label="Net Revenue" value={formatCurrency(pnl.netSales)} />
              {pnl.costTracked ? (
                <>
                  <Row label="Estimated Product Cost" value={formatCurrency(pnl.estimatedProductCost)} sign="- " />
                  <Row label="Estimated Gross Profit" value={formatCurrency(pnl.grossProfit)} />
                </>
              ) : null}
              <Row label="Operating Expenses" value={formatCurrency(pnl.operatingExpenses)} sign="- " />
              <Row label="Salary &amp; Commission" value={formatCurrency(pnl.salaryExpense)} sign="- " />
              <Total
                label={`${pnl.basis} Net Operating Result`}
                value={formatCurrency(pnl.operatingResult)}
                tone={num(pnl.operatingResult) >= 0 ? 'positive' : 'total'}
              />
              <Note>
                {pnl.costNote} Savings transfers and drawer movements are excluded — they move money between salon accounts rather than consuming it.
              </Note>
            </Card>

            <CashInHandCard cash={cash} showSalaryLine />

            {/* Row 6 */}
            <Card title="Cash in Bank / Online">
              <Row label="Opening Balance" value="Not tracked" muted />
              <Row label="Esewa / PhonePay Revenue" value={formatCurrency(online.esewaPhonePay)} sign="+ " />
              <Row label="Bank QR Revenue" value={formatCurrency(online.bankQr)} sign="+ " />
              <Row label="Online Expenses" value={formatCurrency(online.onlineExpenses)} sign="- " />
              <Row label="Salary Paid" value={formatCurrency(online.onlineSalary)} sign="- " />
              <Row label="Savings Transfers" value={formatCurrency(online.onlineSavings)} sign="- " />
              <Total label="Net Online / Bank Balance" value={formatCurrency(online.netOnlineBalance)} />
              <Note>Cash deposited into a bank or Sahakari account appears under Savings, never as an online collection.</Note>
            </Card>

            <ServiceCategoryCard categories={summary.serviceCategories} />

            {/* Row 7 */}
            <Card title="Purchase Category">
              {purchases.categories.length === 0 ? (
                <Empty>No purchase data</Empty>
              ) : purchases.categories.map((row) => (
                <CategoryRow key={row.category} name={row.category} quantity={row.quantity} amount={row.estimatedValue} />
              ))}
            </Card>

            <ProductCategoryCard categories={summary.productCategories} />

            {/* Row 8 */}
            <TokenCard tokens={tokens} directBills={quantities.directBills} />

            <Card title="Net Available Balance">
              <ImpactBlock
                caption="Total Impact"
                value={formatCurrency(kpis.netAvailableBalance)}
                footnote="Collected less expenses, salary and savings"
                positive={num(kpis.netAvailableBalance) >= 0}
              />
            </Card>

            {/* Row 9 */}
            <Card title="Quantity Summary">
              <Row label="Services Sold" value={quantities.servicesSold} />
              <Row label="Products Sold" value={quantities.productsSold} />
              <Row label="Bills" value={quantities.bills} />
              <Row label="Customers Served" value={quantities.uniqueCustomers} />
              <Row label="New Customers" value={quantities.newCustomers} />
              <Row label="Tokens Generated" value={quantities.tokensGenerated} />
              <Row label="Token Conversions" value={quantities.tokenConversions} />
              <Row label="Expense Records" value={quantities.expenseRecords} />
              <Row label="Salary Records" value={quantities.salaryRecords} />
              <Row label="Savings Records" value={quantities.savingsRecords} />
              <Row label="Inventory Purchase Records" value={quantities.inventoryPurchaseRecords} />
              <Row label="Store Sessions" value={quantities.storeSessions} />
              <Row label="Cancelled Bills" value={quantities.cancelledBills} />
            </Card>

            <Card title="Staff Performance">
              {summary.staffPerformance.length === 0 ? (
                <Empty>No staff-attributed services for this period</Empty>
              ) : summary.staffPerformance.map((staffRow) => (
                <CategoryRow
                  key={staffRow.staffId}
                  name={staffRow.staffName}
                  quantity={staffRow.servicesCompleted}
                  amount={staffRow.revenue}
                  quantityLabel="Services"
                />
              ))}
            </Card>
          </>
        ) : null}
      </ReportSheet>
    </div>
  );
}
