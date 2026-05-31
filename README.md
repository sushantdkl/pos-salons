# Salon POS System

A professional Salon Management POS built with Next.js for day-to-day salon operations, billing, staff commissions, inventory, customers, reports, and reminders.

## Testing Access

License enforcement is disabled during development, Vercel preview, and current Vercel production testing.

```env
NEXT_PUBLIC_LICENSE_ENABLED=false
```

With this value the app is directly accessible and does not require activation.

## Roles

Only five roles are enabled:

| Role | Default Username | Testing PIN | Access |
| --- | --- | --- | --- |
| Admin | admin | 1111 | All modules |
| Cashier | cashier | 2222 | Billing, customers, services, inventory view, reminders |
| Barber | barber | 3333 | Assigned services, personal performance, commission summary |
| Stylist | stylist | 4444 | Assigned services, personal performance, commission summary |
| Beautician | beautician | 5555 | Beauty services, personal performance, commission summary |

The login screen displays the demo PIN when a role profile is selected.

## App Routes

- `/login`
- `/dashboard/admin`
- `/dashboard/cashier`
- `/dashboard/barber`
- `/dashboard/stylist`
- `/dashboard/beautician`
- `/dashboard/admin/staff-performance`

Core operational modules:

- Services
- Billing
- Customers
- Staff and commission
- Inventory
- Reports
- Reminders
- Settings

## Architecture

Source code lives under `src/`:

- `src/app` - Next.js pages and API routes
- `src/modules` - business domains with types, validation, repository, and service layers
- `src/components` - reusable UI and layout components
- `src/lib` - auth, database, license, and utilities
- `src/constants` - shared constants
- `src/utils` - framework-neutral helpers

See the `/docs` folder for product, technical, app flow, UI/UX, backend schema, and implementation planning documents.

## Documentation

- `docs/PRD.md` - product requirements and acceptance criteria
- `docs/TRD.md` - technical requirements and architecture
- `docs/APP_FLOW.md` - role, billing, navigation, and error flows
- `docs/UI_UX_BRIEF.md` - design system and experience standards
- `docs/BACKEND_SCHEMA.md` - backend entities, relationships, validation, and indexes
- `docs/IMPLEMENTATION_PLAN.md` - phased roadmap and delivery criteria

## Development

```bash
npm install
npm run dev
```

Default local URL:

```txt
http://localhost:3002
```

## Verification

```bash
npm run lint
npm run build
```

Both commands must pass before deployment or push.
