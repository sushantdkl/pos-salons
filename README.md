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
| Cashier / Beautician | kanchan | 2222 | Billing, customers, products, receipts, reminders, beauty services |
| Barber | raashid | 3333 | Hair Cut, Hair Wash, Shaving, Head Massage, Threading |
| Barber | salman | 4444 | Hair Cut, Hair Wash, Shaving, Head Massage, Threading |
| Barber | saajid | 5555 | Hair Cut, Hair Wash, Shaving, Head Massage, Threading |

The login screen displays a Demo Access panel and fills the demo PIN when a staff profile is selected.

## Service Catalog

The app seeds the client rate card services and fast billing packages:

- Hair Cut, Hair Wash, Shaving, Head Massage, Threading
- Normal Cleansing, Deep Cleansing, Wine Facial, Fruit Facial, Lotus Facial
- Hair Colouring, Cap Highlight, Hair Straight, Keratin, Piece Highlight
- Silver, Gold, and Platinum men's packages

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

## Database And Hosting

The app uses PostgreSQL through `DATABASE_URL`. For cPanel/SastoHost, create the PostgreSQL database and user in cPanel, assign all privileges, then configure:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@localhost:5432/CPANEL_DB_NAME
PG_SSL=false
```

Apply the schema and seed scripts to the cPanel PostgreSQL database before starting the app:

```bash
psql "$DATABASE_URL" -f docs/postgresql-schema.sql
psql "$DATABASE_URL" -f docs/postgresql-seed.sql
```

Runtime CMS uploads should use:

```env
UPLOAD_DIR=/home/CPANEL_USERNAME/public_html/uploads/website-assets
NEXT_PUBLIC_UPLOAD_BASE_URL=https://thehaircut.com.np/uploads/website-assets
```

## Documentation

- `docs/PRD.md` - product requirements and acceptance criteria
- `docs/TRD.md` - technical requirements and architecture
- `docs/APP_FLOW.md` - role, billing, navigation, and error flows
- `docs/UI_UX_BRIEF.md` - design system and experience standards
- `docs/BACKEND_SCHEMA.md` - backend entities, relationships, validation, and indexes
- `docs/IMPLEMENTATION_PLAN.md` - phased roadmap and delivery criteria
- `docs/CPANEL_POSTGRESQL_DEPLOYMENT.md` - cPanel PostgreSQL setup, env vars, uploads, and hosting checklist

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
