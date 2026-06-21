# cPanel PostgreSQL Deployment Guide

This Salon POS uses PostgreSQL through the `DATABASE_URL` environment variable. It does not require provider-specific database connection variables.

## 1. Create PostgreSQL Database In cPanel

1. Open cPanel.
2. Go to **PostgreSQL Databases**.
3. Create a database.
4. Create a database user.
5. Assign the user to the database with **All Privileges**.
6. Open **phpPgAdmin** and confirm the database is visible.

Use one of these formats:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@localhost:5432/CPANEL_DB_NAME
```

If `localhost` fails:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@127.0.0.1:5432/CPANEL_DB_NAME
```

Set `PG_SSL=false` for local cPanel PostgreSQL unless the host explicitly requires SSL.

## 2. Apply Schema And Seed Data

This project does not use Prisma. Apply the SQL scripts in phpPgAdmin or with `psql`:

```bash
psql "$DATABASE_URL" -f docs/postgresql-schema.sql
psql "$DATABASE_URL" -f docs/postgresql-seed.sql
```

The seed creates the required salon roles/users, services, packages, staff profiles, CMS defaults, and settings.

Default testing PINs:

| Staff | Role | PIN |
| --- | --- | --- |
| Admin | Admin | 1111 |
| Kanchan | Cashier / Beautician | 2222 |
| Raashid | Barber | 3333 |
| Salman | Barber | 4444 |
| Saajid | Barber | 5555 |

## 3. cPanel Environment Variables

Configure these in the cPanel Node.js app environment:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@localhost:5432/CPANEL_DB_NAME
PG_SSL=false
NEXTAUTH_SECRET=secure-random-secret
NEXTAUTH_URL=https://thehaircut.com.np
NEXT_PUBLIC_SITE_URL=https://thehaircut.com.np
NEXT_PUBLIC_LICENSE_ENABLED=false
NEXT_PUBLIC_SALON_WHATSAPP_NUMBER=9779858051694
UPLOAD_DIR=/home/CPANEL_USERNAME/public_html/uploads/website-assets
NEXT_PUBLIC_UPLOAD_BASE_URL=https://thehaircut.com.np/uploads/website-assets
```

## 4. Upload Folders

Create these folders or allow the upload helper to create them:

```txt
public_html/uploads/website-assets/
public_html/uploads/website-assets/gallery/
public_html/uploads/website-assets/services/
public_html/uploads/website-assets/staff/
public_html/uploads/website-assets/packages/
public_html/uploads/website-assets/banners/
public_html/uploads/website-assets/payment-qr/
public_html/uploads/website-assets/seo/
```

The folder must be writable by the Node.js app and publicly accessible from `NEXT_PUBLIC_UPLOAD_BASE_URL`.

## 5. Build And Start

Use a Node.js version supported by Next.js 16. Recommended: Node 20+.

```bash
npm install
npm run build
npm run start
```

The app starts through `server.js` and listens on `process.env.PORT || 3000`.

## 6. Pre-Hosting QA

Verify before going live:

- Public website opens.
- WhatsApp booking opens the correct phone number.
- POS PIN login works for Admin, Cashier, Barber, Stylist, and Beautician.
- Billing, split payment, QR popup, receipt, and reports work.
- Token-to-customer sync works.
- CMS uploads save into `UPLOAD_DIR` and load from `NEXT_PUBLIC_UPLOAD_BASE_URL`.
- Admin routes and API routes require valid roles.
- License remains disabled while `NEXT_PUBLIC_LICENSE_ENABLED=false`.
- `npm run lint` and `npm run build` pass.
