# Local PostgreSQL Setup

Use this when developing on your own machine. Production on cPanel keeps using its own `DATABASE_URL`.

## 1. Create `.env.local`

Next.js loads `.env.local` over `.env`, so your production cPanel settings stay untouched.

```env
DATABASE_URL=postgresql://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/pos_salons
PG_SSL=false
PG_POOL_MAX=5

NODE_ENV=development
NEXTAUTH_SECRET=local-dev-secret-change-me
NEXTAUTH_URL=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3002
NEXT_PUBLIC_LICENSE_ENABLED=false
NEXT_PUBLIC_SALON_WHATSAPP_NUMBER=9779858051694

UPLOAD_DIR=./uploads/website-assets
NEXT_PUBLIC_UPLOAD_BASE_URL=http://localhost:3002/uploads/website-assets
```

Replace `YOUR_LOCAL_PASSWORD` with the password you set when installing PostgreSQL.

If your password contains special characters (`@`, `#`, `%`, etc.), URL-encode them in `DATABASE_URL`. Example: `Thehaircut@123` becomes `Thehaircut%40123`.

## 2. Run schema + seed

```powershell
npm run db:setup
```

This will:

1. Create the `pos_salons` database if it does not exist
2. Apply `docs/postgresql-schema.sql`
3. Apply `docs/postgresql-seed.sql`

## 3. Start the app

```powershell
npm run dev
```

Open `http://localhost:3002/login`.

## Seeded staff logins

| Username | PIN  | Role                  |
| -------- | ---- | --------------------- |
| admin    | 1111 | Admin                 |
| kanchan  | 2222 | Cashier / Beautician  |
| raashid  | 3333 | Barber                |
| salman   | 4444 | Barber                |
| saajid   | 5555 | Barber                |

Staff shown on the login page come from the database (`users` + `staff_profiles`). Add or edit staff in **Admin → Employees** after logging in.

## Reset local database

To wipe and reseed local data:

```powershell
psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS pos_salons;"
npm run db:setup
```

## Notes

- `.env` can stay pointed at cPanel for deployment.
- `.env.local` is gitignored and is only for your machine.
- The login page loads active staff dynamically from `/api/users/active`.
