# The Hair Cut Pos - cPanel Hosting Steps

Use this guide to host The Hair Cut Pos on cPanel/SastoHost with cPanel PostgreSQL.

## 1. Requirements

- cPanel with Node.js app support.
- cPanel PostgreSQL enabled.
- phpPgAdmin access.
- SSL enabled for the domain.
- Node.js 20 or newer recommended.
- Next.js 15.x is used for cPanel compatibility. Turbopack is intentionally disabled because cPanel Node.js apps often symlink `node_modules` through `nodevenv`.

## 2. Create PostgreSQL Database

In cPanel:

1. Open **PostgreSQL Databases**.
2. Create a database.
3. Create a database user.
4. Assign the user to the database with **All Privileges**.
5. Open **phpPgAdmin** and confirm the database exists.

Database URL format:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@localhost:5432/CPANEL_DB_NAME
```

If `localhost` does not connect, try:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@127.0.0.1:5432/CPANEL_DB_NAME
```

## 3. Apply Database Schema And Seed

Upload or clone the project, then run:

```bash
psql "$DATABASE_URL" -f docs/postgresql-schema.sql
psql "$DATABASE_URL" -f docs/postgresql-seed.sql
```

If shell `psql` is not available, open phpPgAdmin and run the SQL files manually:

1. Run `docs/postgresql-schema.sql`.
2. Run `docs/postgresql-seed.sql`.

For an existing deployed database, do not re-run the seed unless you intentionally want to restore demo data. Apply only the required migrations that are newer than your deployed schema:

```bash
psql "$DATABASE_URL" -f docs/migrations/2026-06-23-add-salon-bill-payment-fields.sql
psql "$DATABASE_URL" -f docs/migrations/2026-07-19-add-website-cms-tables.sql
psql "$DATABASE_URL" -f docs/migrations/2026-07-21-final-pos-sync-enhancements.sql
```

If using phpPgAdmin, open each migration file and run it once from the SQL panel.

## 4. Environment Variables

Set these in the cPanel Node.js app environment:

```env
DATABASE_URL=postgresql://CPANEL_DB_USER:DB_PASSWORD@localhost:5432/CPANEL_DB_NAME
PG_SSL=false
NEXTAUTH_SECRET=replace-with-a-secure-random-secret
NEXTAUTH_URL=https://thehaircut.com.np
NEXT_PUBLIC_SITE_URL=https://thehaircut.com.np
NEXT_PUBLIC_LICENSE_ENABLED=false
NEXT_PUBLIC_SALON_WHATSAPP_NUMBER=9779858051694
UPLOAD_DIR=/home/CPANEL_USERNAME/public_html/uploads/website-assets
NEXT_PUBLIC_UPLOAD_BASE_URL=https://thehaircut.com.np/uploads/website-assets
```

Important:

- Do not expose `DATABASE_URL` or `NEXTAUTH_SECRET` publicly.
- Keep `NEXT_PUBLIC_LICENSE_ENABLED=false` during testing.
- Change `NEXTAUTH_SECRET` to a strong random value before launch.

## 5. Create Upload Folders

Create these folders in cPanel File Manager:

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

Make sure the Node.js app can write to these folders.

Test public access:

```txt
https://thehaircut.com.np/uploads/website-assets/
```

## 6. Install And Build

From the project folder:

```bash
npm install --omit=dev
npm run build
```

If the build passes, cPanel/Passenger should start the app through the configured startup file. For a local smoke test only:

```bash
npm run start
```

The start command uses:

```bash
node server.js
```

## 7. cPanel Node.js App Settings

Recommended settings:

```txt
Application root: project folder
Application startup file: server.js
Application mode: production
Node.js version: 20+
```

The app listens on `process.env.PORT` and binds to `127.0.0.1` by default for cPanel's Node.js reverse proxy. Set `HOST=0.0.0.0` only if your hosting provider specifically requires it.

After setting environment variables:

1. Stop the cPanel Node.js application.
2. Upload the fresh source and complete fresh `.next` folder.
3. Run `npm install --omit=dev`.
4. Run `npm run build` if building on cPanel.
5. Restart the Node.js app from cPanel.
6. Check `/api/health`, `/login`, and `stderr.log`.

If Passenger needs a manual restart trigger:

```bash
mkdir -p tmp
touch tmp/restart.txt
```

Do not permanently run `npm run start` manually while Passenger is managing the app.

Apply this one-time migration if it has not already been applied:

```bash
psql "$DATABASE_URL" -f docs/migrations/2026-07-21-normalize-usernames-for-passenger.sql
```

In phpPgAdmin, paste and execute the SQL file contents once.

## 8. Health Check

Use this endpoint after restarting Passenger:

```txt
https://your-domain.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "app": "The Hair Cut Pos"
}
```

If `/api/health` fails, check `stderr.log` before testing dashboard features.

## 9. Default Testing Login

Use these PINs during testing:

| User | Role | PIN |
| --- | --- | --- |
| Admin | Admin | 1111 |
| Kanchan | Beautician | 2222 |
| Raashid | Barber | 3333 |
| Salman | Barber | 4444 |
| Saajid | Barber | 5555 |

Create the dedicated Cashier account from **Admin > Staff Management** using the real cashier name and salon-approved PIN. Kanchan should remain Beautician-only.

## 10. Post-Deployment QA

Verify:

- `/api/health` returns `status: ok`.
- Public website opens.
- Services page opens.
- Packages page opens.
- Gallery page opens.
- Contact page map loads.
- WhatsApp booking opens `9779858051694`.
- POS login works.
- Admin dashboard opens.
- Cashier dashboard opens.
- Barber dashboard opens.
- Beautician dashboard opens.
- Billing works.
- Split payment works.
- QR popup works.
- Receipt print works.
- Token system works.
- Customer sync works.
- Reports show correct date ranges.
- CMS image upload works.
- Uploaded image URLs do not return 404.
- Inventory stock deduction works.
- Expenses and salary pages work.

## 11. Security Checklist

Before final launch:

- Use a strong `NEXTAUTH_SECRET`.
- Keep `.env.local`, database passwords, logs, and `.git` out of uploads.
- Upload a fresh `.next` build that matches the uploaded `package.json` and `package-lock.json`.
- Do not upload local `node_modules`; install dependencies in the cPanel Node environment.
- Do not run schema or seed SQL automatically from the application startup file.
- Confirm admin APIs require login.
- Confirm CMS APIs are admin-only.
- Confirm billing APIs are admin/cashier-only.
- Confirm uploads allow only JPG, PNG, and WEBP.
- Confirm upload max size is 5MB.
- Confirm SSL is active.
- Confirm database user has only required database access.
- Confirm no `.env` files are inside `public_html`.
- Confirm license remains disabled only for testing.

## 12. Troubleshooting

Database connection fails:

- Check `DATABASE_URL`.
- Try `localhost` then `127.0.0.1`.
- Confirm database user has all privileges.
- Set `PG_SSL=false` for cPanel localhost PostgreSQL.

Images upload but do not show:

- Check `UPLOAD_DIR`.
- Check `NEXT_PUBLIC_UPLOAD_BASE_URL`.
- Confirm folders exist and are writable.
- Open the returned image URL directly in the browser.

Login fails:

- Confirm database schema and seed were applied.
- Confirm `DATABASE_URL` is set in cPanel Node.js environment.
- Restart the Node.js app after changing environment variables.

Build fails:

- Run `npm install`.
- Confirm Node.js version is 20 or newer.
- Run `npm run build` again and check the first error.
