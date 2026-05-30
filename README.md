# Salon POS System

A professional Salon Management POS built with Next.js for day-to-day salon operations, billing, staff commissions, inventory, customers, reports, and reminders.

## Testing Access

License enforcement is disabled during development, Vercel preview, and current Vercel production testing.

```env
NEXT_PUBLIC_LICENSE_ENABLED=false
```

With this value the app is directly accessible and does not require activation.

## Roles

Only four roles are enabled:

| Role | Default Username | Testing Password | Access |
| --- | --- | --- | --- |
| Admin | admin | 123456 | All modules |
| Cashier | cashier | 1234 | Billing, customers, services, inventory view, reminders |
| Stylist | stylist | 2222 | Assigned services, personal performance, commission summary |
| Beautician | beautician | 3333 | Beauty services, personal performance, commission summary |

The login screen displays the testing password when a role profile is selected.

## App Routes

- `/login`
- `/dashboard/admin`
- `/dashboard/cashier`
- `/dashboard/stylist`
- `/dashboard/beautician`

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

See `docs/ARCHITECTURE.md` for module structure and standards.

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
