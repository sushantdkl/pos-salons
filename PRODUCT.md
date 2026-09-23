# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Salon administrators, cashiers, barbers, stylists, and beauticians operating a production point-of-sale and management system.

## Product Purpose

Manage salon billing, customer credit, walk-in service flow, staff, inventory, expenses, payroll, reports, and business-day reconciliation without weakening financial history or role boundaries.

## Operating Context

The system is used at a salon counter and by staff on desktop and mobile screens. Nepal business dates, browser-printed receipts, cash drawers, QR/online payments, customer credit, and salary advances are part of normal operation.

## Capabilities and Constraints

- PostgreSQL-backed Next.js application with existing production routes and records.
- Existing URLs and workflows must remain backward compatible.
- Authorization is enforced server-side; UI visibility is supplementary.
- Administrators retain complete access.
- Cashiers may issue salary advances but never full salary payments or payroll corrections.
- Financial changes preserve audit history and use forward-only migrations.

## Brand Commitments

The existing salon identity, logo, compact operational interface, and established dashboard navigation remain authoritative. The supplied restaurant permissions screen is an interaction reference only and must be translated to salon roles and capabilities.

## Product Principles

- Preserve financial integrity and history.
- Make operational state immediately scannable.
- Grant least privilege while keeping role setup understandable.
- Adapt reference mechanisms to salon work rather than copying restaurant concepts.
- Keep desktop and mobile workflows usable.
