# The Hair Cut — Salon ERP Upgrade: Phase 0 Audit & Execution Plan

Status: **PLAN — awaiting approval. No application code has been changed.**
Date: 2026-09-23
Reference studied: `dimsum.zip` (restaurant ERP, extracted outside the repo for reading only).

---

## 1. Existing Architecture

| Layer | What exists |
|---|---|
| Framework | Next.js 15.5 (App Router) + React 19, custom `server.js` for cPanel/Passenger |
| DB | PostgreSQL via `pg`, `src/lib/db` wrapper (`db.get/all/run/transaction`, `?` placeholders) |
| Schema | `docs/postgresql-schema.sql` + forward-only `docs/migrations/*.sql`, applied by `npm run db:migrate`. `ensureSalonSchema()` is a no-op on Postgres (good — no runtime DDL) |
| Styling | Tailwind v4, `globals.css` (oklch tokens, largely unused by dashboards), Manrope + IBM Plex Sans; pages mostly hard-code hex (`#17140f`, `#ece7e1`, `#6B46E5`…) |
| Icons | `lucide-react` only |
| Charts | No chart library. Hand-rolled SVG (`modules/reports/components/sales-performance-chart.jsx`) |
| Auth | Bearer token in localStorage; server: `requireRole` / `requirePermission` (role_permissions matrix, 2026-09-20) |
| Layout | Single `components/layout/dashboard-layout.jsx` for all roles, flat `allMenuItems` array + one hard-coded Reports accordion |

### Financial sources of truth (server-side)

| Module | Role |
|---|---|
| `lib/reports/finance-summary.js` | **Canonical money maths**: sales, discounts, cash/QR split, expenses (operating vs salary), savings, `revenueScope` (backdated bills), `getSalesSeries` |
| `lib/business-day/service.js` | Business Day / Store Session lifecycle, `computeExpectedCash`, close snapshots, history |
| `lib/reports/executive-summary.js` | Admin + Cashier Executive Summary (built on finance-summary; cashier scope never queries admin sections) |
| `lib/reports/dashboard-summary.js` | Dashboard KPIs (built on finance-summary) |
| `lib/payroll/salary-advances.js` | Advances, application to salary |
| `app/api/reports/center/route.js` | **Independent SQL** — does NOT use finance-summary (see Problems) |

Periods: **two separate implementations** — `lib/reports/dashboard-period.js` (today/3days/7days/month/custom) and `lib/dates/report-periods.js` (today/yesterday/last3/last7/last30/this_week/this_month/last_month/quarter/year/custom, BS-aware).

---

## 2. Module Inventory (actual application)

| Module | Route(s) | Status | Access |
|---|---|---|---|
| Admin Dashboard | `/dashboard/admin` (re-exports `/admin/dashboard`) | IMPLEMENTED | ADMIN ONLY |
| Cashier Dashboard | `/dashboard/cashier` | IMPLEMENTED | CASHIER |
| POS / Billing | `/admin/billing` | IMPLEMENTED | ADMIN + CASHIER |
| Bill void / correction | `api/admin/billing/[id]/corrections` | IMPLEMENTED (API; permission `billing.correct`) | ADMIN (+ permission) |
| Executive Summary | `/admin/executive-summary`, `/cashier/executive-summary` | IMPLEMENTED | both (scoped payloads) |
| Opening & Closing | `/store/opening-closing` + `StoreStatusBar` | IMPLEMENTED | ADMIN + CASHIER |
| Business Day History | `/dashboard/admin/business-days` | IMPLEMENTED | ADMIN ONLY |
| Tokens / Queue | `/dashboard/{admin,cashier}/tokens`, role queues | IMPLEMENTED | all roles (own views) |
| Token Report | `/dashboard/admin/reports/tokens` | IMPLEMENTED — **not in sidebar** | ADMIN |
| Services (+ categories) | `/admin/products` (labelled "Services") | IMPLEMENTED (categories inside page) | ADMIN + CASHIER |
| Products / Stock | `/admin/stock` | IMPLEMENTED | ADMIN + CASHIER |
| Stock movements | `inventory_movements` table only | PARTIAL (no page) | — |
| Customers | `/admin/customers` | IMPLEMENTED | ADMIN + CASHIER |
| Customer credit collection | `/cashier/credit` | IMPLEMENTED | ADMIN + CASHIER |
| Customer ledger (per customer) | `customer_credit_ledger` table | PARTIAL (report only) | — |
| Reminders | `/admin/reminders` | IMPLEMENTED | ADMIN + CASHIER |
| Expenses | `/dashboard/admin/expenses`, `/new`, `/reports` | IMPLEMENTED (`/reports` not in sidebar) | ADMIN |
| Daily Expenses (cashier) | `/dashboard/cashier/daily-expenses` | IMPLEMENTED | CASHIER |
| Salary / Payroll | `/dashboard/admin/expenses/salary` | IMPLEMENTED — **not in sidebar** (reached via Expenses) | ADMIN |
| Salary Advance | `/cashier/advances` | IMPLEMENTED | CASHIER (admin allowed by path rule) |
| Commission | `salon_bill_items.commission_amount`, "Staff Commission" expense | PARTIAL (no page) | — |
| Savings | `/admin/savings`, `/dashboard/cashier/savings` | IMPLEMENTED | both |
| Staff | `/admin/employees` | IMPLEMENTED | ADMIN |
| Staff Performance | `/dashboard/admin/staff-performance` | IMPLEMENTED | ADMIN |
| Staff Permissions | `/admin/permissions` | IMPLEMENTED | ADMIN |
| Reports hub + 7 reports + compare | `/admin/reports`, `/admin/reports/center/[report]`, `/admin/reports/compare` | IMPLEMENTED | ADMIN |
| Transactions report | `/admin/reports/transactions`, `/dashboard/cashier/transactions` | IMPLEMENTED — admin one **not in sidebar** | both |
| Website CMS | `/dashboard/admin/website` | IMPLEMENTED | ADMIN |
| Printer | `/admin/printer` | IMPLEMENTED | ADMIN |
| Settings | `/admin/settings` | IMPLEMENTED | ADMIN |
| Analytics | — | NOT PRESENT (Phase 5 adds it) | — |
| Suppliers / Purchases / Supplier Ledger | — | NOT PRESENT | — |
| Chart of Accounts / Journal / GL / Cash Book / Bank Book / Bank Reconciliation | — | NOT PRESENT (no double-entry ledger) | — |
| Manual Cash In / Cash Out | only as opening-cash `CASH_TRANSFER` rows | PARTIAL | — |
| Attendance / Departments / Holidays | — | NOT PRESENT | — |
| Wastage / Stock adjustments UI | — | NOT PRESENT | — |
| Cash denomination storage | — | NOT PRESENT (`store_sessions` has only totals) | — |

Rule for the new sidebar: **NOT PRESENT modules are not shown.** No placeholders, no "coming soon" links.

---

## 3. Current Sidebar

Flat list of ~28 items in `dashboard-layout.jsx`, per-item decorative icon colours, one collapsible "Reports" group. Issues:
- No module-family grouping; admin sees ~20 top-level rows.
- Icon reuse: `Scissors` for Tokens *and* Services; `Users` for Staff, Customers, Performance; `DollarSign` for Billing, Expenses, Salary Advance.
- Colour carries no meaning (emerald used for Opening, Expenses, Savings, Daily Expenses).
- Reports accordion hard-codes `reportsOpen`; there is no generic group mechanism.
- "Services" label points at `/admin/products`.
- Salary, Token Report, Transactions and Expense Reports routes exist but are unreachable from navigation.

---

## 4. Problems Found

### 4a. Financial correctness (must be resolved before visual work touches these numbers)

| # | Problem | Evidence | Severity |
|---|---|---|---|
| F1 | **Void double-counts in Expected Cash.** Void sets bill `status='cancelled'` (drops it from `grossCashCollected`) AND inserts `payment_refunds`, which `computeExpectedCash` subtracts again. A cash bill voided in the same session lowers Expected Cash by 2× its value. | `api/admin/billing/[id]/corrections/route.js`, `business-day/service.js:123-148` | CRITICAL (to confirm with a runtime test) |
| F2 | **Void rewrites history.** Cancelling a bill removes it from the ORIGINAL day's revenue and cash in every recomputed report, while that day's closed session snapshot still includes it. Reports and snapshots disagree for any day with a later void. | same | HIGH |
| F3 | **Executive Summary "live" Expected Cash ≠ Opening & Closing** while a session is open: it (a) omits cash credit collections, (b) omits cash refunds, (c) adds opening `CASH_TRANSFER` adjustments on top of a `starting_cash` that already includes them, (d) uses the first session's float, so a Session-1 shortage/overage is ignored on multi-session days. | `executive-summary.js:726-729` vs `computeExpectedCash` | HIGH |
| F4 | Report Center uses independent SQL: `status='paid'` only (finance-summary uses `paid`+`completed`), calendar dates only (no revenue business-day rule for backdated bills), cash/online from `salon_payment_allocations` rather than bill cash/qr fields. | `api/reports/center/route.js` | MEDIUM |
| F5 | Expenses report sums **all** expense rows incl. salary, commission and non-P&L `CASH_TRANSFER` rows; every other screen excludes them. | same, `report==='expenses'` | MEDIUM |
| F6 | Admin dashboard commission / top services / top customers use `b.business_day_id`, not `revenueScope`, so backdated bills land on the wrong day. | `api/admin/dashboard/route.js` | LOW |
| F7 | Executive Summary advertises `refunds:false`, `customerCredit:null` although `payment_refunds`, `customer_credit_ledger`, `customer_credit_collections` exist since 2026-09-20. Credit sales and collections are not shown in the Summary at all. | `executive-summary.js:845-860` | MEDIUM |
| F8 | Two period implementations (`dashboard-period.js`, `report-periods.js`) with different vocabularies and week/month rules. | — | MEDIUM |

### 4b. UI / consistency
- Three card vocabularies: `components/ui/card.jsx`, `components/reports/executive-report.jsx` (`Card/Row/Total`), and local `CARD`/`Section`/`Row` in the Opening & Closing page.
- Tokens in `globals.css` (oklch navy/teal) are unrelated to the hex palette actually used on dashboards.
- Status vocabulary drifts (MATCHED/SHORT/OVER vs "positive/outflow/alert" tones).
- Empty/loading/error states are page-local.

### 4c. Security / permissions
- `GET /api/users/active` is unauthenticated and returns every active username + role (likely serves the login picker — confirm intent; username enumeration risk).
- `canAccessPath('/cashier/*')` allows admin too (fine) — but any new `/admin/analytics` API must be admin-guarded server-side, not only by path.

### 4d. Repo state
- **35 modified + many untracked files are uncommitted** (+1680 / −900 lines) on `main`. Work should start from a checkpoint commit or branch so each phase can be diffed and rolled back.

---

## 5. What we take from the restaurant reference — and what we don't

| Take | Don't take |
|---|---|
| Grouped, tinted, collapsible nav (`NAV_TINTS` / `GROUP_TINTS`, one group open at a time, longest-prefix active match, auto-open parent) | Restaurant modules (tables, KOT, waiter, kitchen, recipes, delivery, reservations, combos) |
| Summary report *structure*: Money In / Money Out / Cash Position / Profitability / Category Breakdown / Quantity, `ReportGroup` + `Section` + `line()` kit, print colour handling | Its data layer — it reads a **double-entry journal** (`journal_lines`, `accounts` 1010/1020/1300). The salon has no journal; our Summary stays on `finance-summary` + `executive-summary` |
| `DenominationTable` idea (1000…1 ladder, one renderer everywhere) | Chart of Accounts / GL / Bank Book / Bank Reconciliation pages |
| Analytics layout: KPI row + tabs, one `compose` service, `safe()` wrappers, previous-period comparison | `recharts` dependency (decision below) |
| Separate "Cash Ledger ≠ Expected Drawer" explanation | "Business Funding", "Cash Exchange" (not salon concepts here) |

---

## 6. Proposed Sidebar (Admin) — only real routes, no duplicates

| Group (tint) | Items → route |
|---|---|
| — top level — | Dashboard → `/dashboard/admin` · POS → `/admin/billing` · Analytics → `/admin/analytics` *(Phase 5)* · Summary → `/admin/executive-summary` |
| **Reports** (indigo) | Business Overview · Sales & Invoices · Services · Products & Retail · Payment Reconciliation · Customer Credit · Expenses · Tokens (`/dashboard/admin/reports/tokens`) · Transactions (`/admin/reports/transactions`) · Compare |
| **Salon Operations** (teal) | Tokens / Queue · Services & Categories (`/admin/products`) · Customers · Reminders |
| **Inventory** (lime) | Products & Stock (`/admin/stock`) — single item, rendered as a tinted top-level link |
| **Finance** (amber) | Opening & Closing · Business Day History · Expenses · Savings · Credit Collection |
| **HRM** (violet) | Staff · Salary & Payroll (`/dashboard/admin/expenses/salary`) · Salary Advances (`/cashier/advances`) · Salary Advances Report · Staff Performance · Staff Permissions |
| **System** (gray) | Website CMS · Printer · Settings |
| Accounting | **omitted** — no accounting module exists |

Cashier sidebar: same component, same tints, but only the cashier's existing items, grouped. No item added or removed for cashier in Phase 1.

Implementation: move nav definitions to `src/constants/navigation.js` (single source), render from it; route access still enforced by `canAccessPath` + APIs. Existing URLs unchanged.

---

## 7. Execution Plan

Each phase ends with: lint, build, runtime check, permission check, change list, **PASS / BLOCKED**. No next phase on a critical regression.

| Phase | Scope | Key files | Risk |
|---|---|---|---|
| **0.5 Financial correctness** *(needs approval — changes definitions)* | Fix F1–F3, F5; make Report Center read shared scopes (F4); define void semantics (see decision D2). Add unit tests for expected-cash scenarios (normal, split, void same session, void later session, reopen with shortage, opening adjustment). | `business-day/service.js`, `executive-summary.js`, `finance-summary.js`, `reports/center/route.js`, `tests/unit/*` | HIGH — money |
| **1 Sidebar / IA** | `constants/navigation.js`, grouped tinted accordion, auto-open active parent, keyboard (Enter/Space/Arrow), collapsed-rail tooltips, mobile drawer unchanged. Unique icons per page. | `dashboard-layout.jsx`, new `constants/navigation.js` | LOW |
| **2 Shared ERP primitives** | `components/erp/`: PageHeader, PeriodFilter, MetricCard/Group, ReportGroup/Section/Line, FinancialTable, StatusBadge, EmptyState, AlertBanner, ChartCard, BreakdownCard, ReconciliationPanel, BusinessDayStatus, DenominationCounter, PrintHeader. Semantic colour tokens on `:root` (inflow/outflow/cash/online/ledger/hrm/ops/neutral). One shared period module replacing both period files (keeps old exports as thin wrappers). | `components/erp/*`, `globals.css`, `lib/dates/periods.js` | LOW-MED |
| **3 Opening & Closing** | Status header, Sections A–E, dark reconciliation panel, expandable cash calculation (from `computeExpectedCash` breakdown — no UI maths except denomination sum, which is operator input), online position separate, improved history table + detail drawer. `StoreStatusBar` remains the only lifecycle implementation. | `store/opening-closing/page.jsx`, `store-status-bar.jsx`, `api/store/*`, `business-days/page.jsx` | MED |
| **4 Summary** | Rebuild `/admin/executive-summary` (+ cashier variant) as a narrow printable report: Money In, Money Out, Cash Position (drawer / cash movement statement / online), Savings, Profitability (estimated, labelled), Salon Breakdown, Quantities. Add credit sales + collections + refunds/voids to the **service**, not the page. Print CSS. | `executive-summary.js`, both summary pages, `components/erp/*` | MED |
| **5 Analytics** | New `/admin/analytics` + `api/admin/analytics` (admin-only), `lib/reports/analytics.js` composing existing services + new aggregations (top services by revenue/qty, customer new vs returning, staff, products, tokens by hour, controls: voids/refunds/discounts/shortages/reopens). Tabs only where data exists. Charts via shared SVG primitives. | new files | MED |
| **6 Dashboard** | Reframe to "right now": Business Day, store/session, KPIs, queue, recent bills, low stock, staff activity, alerts. Remove analytics-style duplication. | `admin/dashboard/page.jsx`, `api/admin/dashboard` | LOW-MED |
| **7 Consistency** | Apply headers/period/tables/badges/empty/loading/error states to the remaining admin pages. Page-by-page, verified. | many pages | LOW each |
| **8 Permission audit** | Hit every API as cashier; 403 on salary/advance-report/commission/P&L/analytics/user admin. Script under `scripts/`. Decide on `/api/users/active`. | APIs, `scripts/verify-*.mjs` | MED |
| **9 Responsive QA** | Playwright at 360/390/430/768/1024/1280/1440 for sidebar, dashboard, analytics, summary, opening/closing, POS, tokens; assert no `scrollWidth > clientWidth` at page level. | `tests/e2e/*` | LOW |
| **10–12 Financial regression / same-day reopen / new day** | Scripted scenario (Rs 2,000 float, 5,000 cash services, 3,000 online, 1,000 cash product, 500 discount, 500 cash expense, 1,000 cash savings, 1,000 cash advance), known shortage, reopen, next day — assert identical values across Dashboard / Opening & Closing / Summary / Analytics / Reports / DB. **QA database only.** | `tests/integration/*` | — |
| **Final** | lint, build, `npm start`, smoke all pages as admin + cashier. | — | — |

Database changes anticipated: **none required** for Phases 1–2, 4–9. Phase 3 needs one only if denominations are persisted (D3). Any migration is a new forward-only file in `docs/migrations/`, applied via `npm run db:migrate`, never at runtime.

---

## 8. Decisions needed before starting

- **D1 — Checkpoint:** commit the current 35 uncommitted files (or create a branch) before Phase 1?
- **D2 — Void semantics (F1/F2):** recommended: a void is an event on the day it happens. The original bill's revenue stays on its original day, and the refund appears as a negative on the void day (Refunds/Voids line). Expected Cash subtracts the refund exactly once. Historical closed days no longer change.
- **D3 — Denominations:** (a) counting UI only, persist the total as today (no DB change), or (b) add `store_sessions.cash_denominations JSONB` via migration so history can show the note breakdown.
- **D4 — Charts:** keep hand-rolled SVG primitives (no new dependency, recommended for cPanel) or add `recharts` as the reference does.
- **D5 — QA database:** is the DB in `.env.local` a disposable QA copy? Phases 3 and 10–12 create real bills, closes and reopens.
- **D6 — `/api/users/active`:** intended public for the login picker, or should it require auth?

---

## Phase 0 — PASS (architecture understood; financial issues F1–F3 recorded as blockers for Phases 3/4/10 until D2 is decided)

---

## Decisions recorded (2026-09-23)

- D1 checkpoint: committed on branch `salon-erp-upgrade` (eafb686).
- D2 voids: a void reduces sales on the day it is PROCESSED; the sale day is never rewritten.
- D3 denominations: persist the count of each note (migration in Phase 3).
- D4 charts: `recharts`, as in the restaurant system.
- D5 QA data: local `thehaircut_qa` clone + `scripts/qa/*` (seed, scenario). Never the source DB.

## Phase 0.5 — Financial correctness — PASS

Changes:
- `finance-summary.js`: `soldBillSql` (voided bills stay sold on their sale day), `eventScope`,
  `getEventTotals` (voids, cash/online refunds, credit collections), net sales = finalized − voids,
  cash/online movement include refunds + credit collections, credit sales, void-adjusted sales trend,
  credit_amount in the bill reconcile check.
- `business-day/service.js`: Expected Cash reads every term from `getFinancialSummary` (fixes F1
  double-count); history Sales = billed − voids of that day.
- `executive-summary.js`: live drawer = `computeExpectedCash(open session)` (fixes F3); voids, refunds,
  credit sales/collections, receivable balance (F7); product cost uses bill-line unit cost and removes
  voided products on the void day.
- `dashboard-summary.js`, `api/admin/dashboard`, `api/admin/reports`, `api/reports/center`: money read
  from the shared summary / shared sold rule; revenue-day scope (F4, F5, F6).
- `api/store/summary`: cashier response no longer carries salary figures.
- `api/admin/billing/[id]/corrections`: void stamped with its store session.
- **Bug fixed:** `createAdvance` INSERT had 22 values for 21 columns — every salary advance failed.
- Migration `2026-09-23-void-event-attribution.sql` (session column on corrections, indexes).

Evidence: `npm run qa:scenario` against the QA app — 46/46 checks (same-session void, shortage close,
same-day reopen, history snapshots, admin/cashier/dashboard/close-preview agreement, cashier salary
redaction). Lint clean, unit 15/15, build OK.

Known, unchanged: payroll commission (`api/admin/expenses`) counts `status='paid'` bills only, so a
voided service earns no commission — intended.
