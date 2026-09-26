# Salon production enhancement handoff

## Delivered scope

- Canonical AD dates with BS input/display conversion and `Asia/Kathmandu` report boundaries.
- Central calendar, receipt paper, document visibility and salary-advance policy settings.
- 58 mm/80 mm browser-print receipt layout with finalized document snapshots.
- Canonical Cash/Online/Credit allocations, exact minor-unit split validation, cash tender/change, legacy mapping and idempotency.
- Customer credit sales, collections, ledger entries and drawer-safe cash collection.
- Cashier advance-only workflow, cumulative configurable ceiling, outstanding recovery and server-side salary denial.
- Permission storage/audit, immutable bill correction/refund records and inventory restoration on void.
- Feature reports and independent side-by-side comparison with pagination and CSV.
- Security headers and removal of employee contact details from the public active-user response.

## Financial definitions

- Gross billed: invoice subtotal before discount, tax and service charge.
- Revenue after voids: finalized invoice grand total where bill status remains `paid`.
- Cash/online received: allocation rows by canonical settlement method.
- Credit issued: credit allocations; customer outstanding is ledger debit minus credit.
- Credit collection: ledger credit, with a separate cash/online collection record.
- Expected drawer cash: opening cash + cash invoice allocations + cash credit collections - cash expenses - cash refunds - cash savings transfers.
- Product cost: finalized bill-item cost snapshot multiplied by quantity.
- Salary advance outstanding: advance amount minus valid payroll applications; applications cannot exceed an advance.
- Money is rounded and validated to two-decimal minor units at financial API boundaries.

## Deployment sequence

1. Back up PostgreSQL and application files.
2. Deploy the application and lockfile together.
3. Run `npm ci` using the supported Node runtime.
4. Run `npm run db:plan`, then `npm run db:migrate`, then `npm run db:verify`.
5. Run `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:integration`, and `npm run build`.
6. Restart Passenger/application processes.
7. Admin must set the salary-advance ceiling in Settings before any advance can be issued.
8. Verify one test bill for each payment mode, a credit collection, receipt widths, report reconciliation and cashier HTTP 403 denial.

Migrations are forward-only. The runner executes only its reviewed manifest and uses checksums plus a PostgreSQL advisory lock. Historical SQL repair scripts are deliberately excluded.

## Recovery

- Application rollback: deploy the prior application package. Additive database tables/columns can remain; old code does not depend on them.
- Data rollback: do not drop financial tables after production writes. Correct test/incorrect financial activity through reversal records.
- If a migration fails, its transaction rolls back and `schema_migrations` is not advanced.
- Restore the pre-release database backup only when the whole release must be reverted and no valid post-release activity needs preservation.

## Manual production checks

- Confirm server/database session timezone behavior and Nepal midnight reports.
- Compare paid bill grand totals with allocation totals.
- Confirm historical bills received legacy allocation projections without changing original bill fields.
- Confirm a cashier can issue an allowed advance but receives HTTP 403 for salary create/correct/delete.
- Confirm cash advance, cash credit collection and cash refund alter expected drawer cash once.
- Print sample 58 mm and 80 mm receipts on actual configured printers; browser printing does not guarantee hardware completion.
- Confirm report permissions, drill-down identifiers, exports and mobile comparison tabs.

## Known release note

`npm audit --omit=dev` reports one remaining high-severity advisory through Sharp/libvips. Its suggested fix is Sharp 0.35.4, a breaking upgrade, so it was not forced into this compatibility-focused release. Next.js was patched from 15.5.19 to 15.5.25 to remove the critical framework findings. Validate the Sharp upgrade separately against image upload/optimization before deployment.
