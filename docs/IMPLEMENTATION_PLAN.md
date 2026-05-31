# Salon POS Implementation Plan

## Phase 1: Codebase Cleanup

Objectives:

- Remove old domain identity from source, UI, routes, assets, docs, and dependencies.
- Keep required Next.js structure and working features.

Deliverables:

- Clean source folders.
- Removed unused tracked assets.
- Removed unused package dependencies.
- Updated documentation.

Risks:

- Removing a file that is still referenced.
- Removing a dependency used indirectly by the build.

Acceptance Criteria:

- Source scan shows no old operational wording.
- `npm run lint` passes.
- `npm run build` passes.

## Phase 2: Authentication & Roles

Objectives:

- Support Admin, Cashier, Barber, Stylist, and Beautician.
- Use PIN login for testing while preserving secure hash/session architecture.

Deliverables:

- Role constants.
- Demo PIN display.
- Role dashboard routing.
- API role checks.

Risks:

- Unauthorized role access.
- Inactive users logging in.

Acceptance Criteria:

- All supported roles log in with PIN.
- Each role redirects correctly.
- Unauthorized APIs return a blocked response.

## Phase 3: Service Management

Objectives:

- Manage salon services with category, price, duration, status, description, and assigned staff.

Deliverables:

- Service CRUD.
- Search and category filter.
- Validation.

Risks:

- Invalid price or duration.
- Inactive services used in billing.

Acceptance Criteria:

- Service create, edit, delete/deactivate, search, and filter work.
- Invalid service input is rejected.

## Phase 4: Billing

Objectives:

- Build a fast salon billing flow with customer, services, products, staff assignment, discount, payment, receipt, and history.

Deliverables:

- Billing UI.
- Bill transaction API.
- Receipt and print support.
- Inventory deduction.
- Customer and staff updates.

Risks:

- Bill completion without assigned staff.
- Negative stock.
- Incorrect total or commission.

Acceptance Criteria:

- Bills cannot complete without required staff assignments.
- Totals and discounts calculate correctly.
- Product stock decreases correctly.

## Phase 5: Customers

Objectives:

- Maintain customer profiles, preferences, visit history, spending, and category.

Deliverables:

- Customer CRUD.
- Search by name/phone.
- Billing auto-save.
- Customer intelligence fields.

Risks:

- Duplicate phone records.
- History not updating after billing.

Acceptance Criteria:

- Customer creation/edit/search works.
- Billing updates visits, spending, favorites, and preferred staff.

## Phase 6: Staff & Commission

Objectives:

- Track staff roles, assigned services, revenue, service counts, customers served, and commission.

Deliverables:

- Staff CRUD.
- Commission percentage.
- Staff performance dashboards.
- Admin performance leaderboard.

Risks:

- Commission math drift.
- Staff roles not matching billing assignment.

Acceptance Criteria:

- Commission equals service revenue multiplied by percentage.
- Staff dashboards show daily, weekly, monthly, and lifetime metrics.

## Phase 7: Inventory

Objectives:

- Track salon products and stock movements.

Deliverables:

- Product CRUD.
- Stock in/out.
- Sale movements.
- Low stock alerts.
- Inventory valuation.

Risks:

- Stock going negative.
- Product sale not creating movement history.

Acceptance Criteria:

- Stock movements update quantities.
- Negative stock is blocked.
- Product sale creates inventory movement.

## Phase 8: Reports

Objectives:

- Provide salon business visibility to admins.

Deliverables:

- Revenue summaries.
- Top services.
- Staff performance.
- Customer activity.
- Product sales.
- Payment breakdown.
- Business insights.

Risks:

- Slow aggregation as data grows.
- Inconsistent report date handling.

Acceptance Criteria:

- Reports show accurate values from persisted bill data.
- Insights use salon wording and useful business signals.

## Phase 9: Reminders

Objectives:

- Provide manual WhatsApp reminders.

Deliverables:

- Reminder screen.
- Prefilled WhatsApp links.
- SMS placeholder for future provider integration.

Risks:

- Missing phone numbers.
- Poorly encoded message text.

Acceptance Criteria:

- Reminder requires customer phone.
- WhatsApp opens with prefilled salon message.

## Phase 10: QA & Optimization

Objectives:

- Verify functional, security, responsive, and build quality.

Deliverables:

- Lint and build verification.
- Runtime QA checklist.
- Browser smoke testing.
- Source scan for old domain wording.

Risks:

- Hidden runtime errors not caught by build.
- Mobile layout regressions.

Acceptance Criteria:

- Login, role routing, user creation, services, billing, customers, staff, inventory, reports, reminders, and navigation pass QA.
- Build is Vercel-ready.

## Phase 11: Production Readiness

Objectives:

- Prepare for real deployment and future license enforcement.

Deliverables:

- Environment variable documentation.
- License feature flag preserved.
- Deployment notes.
- Security review.

Risks:

- License accidentally blocking testing deployments.
- Serverless database persistence limitations.

Acceptance Criteria:

- Testing deployments are accessible with `NEXT_PUBLIC_LICENSE_ENABLED=false`.
- Future release can enable license checks with `NEXT_PUBLIC_LICENSE_ENABLED=true`.
- Repository is clean and pushed only after verification passes.
