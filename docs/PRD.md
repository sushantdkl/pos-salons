# Salon POS Product Requirements Document

## Project Overview

Salon POS is an internal business management system for salons that need fast billing, customer history, staff performance tracking, inventory control, reports, and manual reminders. The system is designed for daily use by owners, reception staff, barbers, stylists, and beauticians.

The product focuses on POS-side salon operations. Public appointment booking, online booking, and public marketing pages are intentionally out of scope for the current testing stage.

## Business Goals

- Reduce billing time at reception.
- Track service revenue by staff member.
- Improve visibility into daily, weekly, and monthly salon performance.
- Maintain customer profiles and repeat visit history.
- Prevent negative product stock.
- Support commission-based staff compensation.
- Keep the system simple enough for non-technical salon staff.
- Keep the codebase ready for future appointments, loyalty, membership, multi-branch, and SaaS expansion.

## User Roles

- Admin: full access to dashboards, users, services, billing, customers, staff, inventory, reports, reminders, settings, and analytics.
- Cashier: billing, customer lookup, customer creation, service/product selection, staff assignment, receipt generation, inventory viewing, and reminders.
- Barber: personal dashboard for assigned work, completed services, revenue, commission, and recent customer service history.
- Stylist: personal dashboard for assigned work, completed services, revenue, commission, and recent customer service history.
- Beautician: personal dashboard for beauty services, completed services, revenue, commission, and recent customer service history. Kanchan is selectable as Beautician for beauty services while logging in as Cashier.

## Launch Staff Configuration

| Staff | Login Role | Service Role | PIN | Assigned Services |
| --- | --- | --- | --- | --- |
| Admin | Admin | Admin | 1111 | Full system access |
| Kanchan | Cashier | Beautician | 2222 | Beauty services, beauty treatments, billing, customers, products, receipts, reminders |
| Raashid | Barber | Barber | 3333 | Hair Cut, Hair Wash, Shaving, Head Massage, Threading |
| Salman | Barber | Barber | 4444 | Hair Cut, Hair Wash, Shaving, Head Massage, Threading |
| Saajid | Barber | Barber | 5555 | Hair Cut, Hair Wash, Shaving, Head Massage, Threading |

## Launch Service Catalog

| Service | Price |
| --- | ---: |
| Hair Cut | 150 |
| Hair Wash | 50 |
| Shaving | 100 |
| Head Massage | 200 |
| Threading | 50 |
| Normal Cleansing | 500 |
| Deep Cleansing | 800 |
| Wine Facial | 1200 |
| Fruit Facial | 1500 |
| Lotus Facial | 1800 |
| Hair Colouring | Starting 500+ |
| Cap Highlight | Starting 1000+ |
| Hair Straight | Starting 1200+ |
| Keratin | Starting 1500+ |
| Piece Highlight | 200 per piece |

Packages:

- Silver Package: 650. Includes Hair Cut, Hair Wash, Shaving, Normal Cleansing.
- Gold Package: 850. Includes Hair Cut, Hair Wash, Shaving, Deep Cleansing.
- Platinum Package: 1450. Includes Hair Cut, Hair Wash, Shaving, Head Massage, Facial.

## Features

- PIN-based staff login for testing.
- Role-based dashboard routing.
- Service management with categories, price, duration, status, description, and assigned staff.
- Billing with customer selection/creation, services, products, discount, payment method, receipt, staff assignment, and stock deduction.
- Customer profiles with phone lookup, total visits, total spending, favorite services, preferred staff, and category.
- Staff management with role, PIN, commission percentage, salary, status, and assigned services.
- Staff performance dashboards for service staff.
- Admin staff performance analytics and leaderboard.
- Inventory product management with stock in/out, low stock alerts, valuation, and sale deduction.
- Reports for revenue, products, services, staff, customers, commission, and payments.
- Manual WhatsApp reminder trigger.
- Public salon website with services, packages, staff, gallery, contact, and WhatsApp booking.
- License feature flag disabled for development, Vercel preview, and current production testing.

## Functional Requirements

- The login screen must display active role cards and demo PINs during testing.
- Login must redirect to the dashboard for the authenticated role.
- Unauthorized users must be blocked from unrelated dashboards and restricted APIs.
- Admin must be able to create active/inactive users with PINs and roles.
- Cashier must select a service performer before completing a bill.
- A bill must not complete with invalid discount, missing service staff, or insufficient stock.
- Product stock must reduce automatically when products are sold.
- Customer visit history, spending, favorite services, and preferred staff must update after billing.
- Staff revenue and commission must calculate from completed service bill items.
- Reports must read from persisted billing, item, product, customer, and staff data.
- WhatsApp reminders must open a prefilled customer message when a phone number exists.
- Public appointment requests must open WhatsApp with a prefilled message and must not write to POS data yet.

## Non-Functional Requirements

- Next.js production build must pass.
- ESLint must pass.
- Screens must be responsive for desktop, tablet, and mobile.
- Billing should remain fast and clear on slow networks.
- Business logic must stay outside UI components where practical.
- API routes must validate and sanitize inputs.
- Sensitive server-only data must not be exposed to client code.
- Billing operations that affect stock, customer history, and revenue must run transactionally.
- License checks must stay isolated behind `NEXT_PUBLIC_LICENSE_ENABLED`.

## Future Roadmap

- Appointment calendar.
- Online booking.
- Loyalty points.
- Membership packages.
- Gift cards and prepaid wallet.
- Multi-branch operations.
- Multi-tenant SaaS isolation.
- Staff attendance and payroll.
- SMS provider integration.
- Mobile app companion.
- Advanced analytics and exports.

## Success Metrics

- Bill creation completed in under one minute for a typical customer.
- Zero completed bills with unassigned service staff.
- Zero product sales that create negative stock.
- Accurate staff commission totals for daily, weekly, and monthly periods.
- Repeat customer and VIP customer identification available from customer data.
- Vercel deployment builds successfully.
- No old domain wording appears in the user interface.

## User Stories

- As an admin, I want to create staff users with PINs so each employee can log in quickly.
- As a cashier, I want to select a customer, add services and products, assign staff, and collect payment in one flow.
- As a barber, I want to see my completed services and commission so I know my performance.
- As a stylist, I want to see recent services and revenue so I can track my work.
- As a beautician, I want to see my daily and monthly performance without accessing admin-only screens.
- As an owner, I want staff leaderboards and revenue trends so I can make business decisions.
- As a receptionist, I want WhatsApp reminders so customers can be contacted quickly.

## Acceptance Criteria

- Admin, Cashier, Barber, Stylist, and Beautician can log in with configured testing PINs.
- Each role lands on the correct dashboard.
- Admin can create users and duplicate usernames are rejected.
- Services can be created, edited, searched, filtered, activated, and deactivated.
- Billing requires staff assignment for every service.
- Billing calculates subtotal, discount, tax/service charge when configured, and grand total correctly.
- Product stock decreases after a product sale.
- Negative stock and invalid discount are blocked.
- Customer totals update after billing.
- Staff commission equals service revenue multiplied by commission percentage.
- Staff dashboards and admin analytics show current persisted performance.
- Manual WhatsApp reminder opens a prefilled message.
- `npm run lint` and `npm run build` pass.
