# Salon POS Architecture

The application uses the Next.js `src/app` router with domain modules under `src/modules`.

## Folder Structure

- `src/app`: Next.js routes, pages, and route handlers.
- `src/components`: Reusable UI and dashboard shell components.
- `src/modules`: Salon business domains. Each module owns its types, validation, repository access, and business service layer.
- `src/lib`: Framework integrations such as database, auth, currency, and license feature flags.
- `src/constants`: Shared domain constants.
- `src/utils`: Small framework-agnostic utilities.
- `src/hooks`, `src/services`, `src/repositories`, `src/types`, `src/configs`: Extension points for reusable client hooks, integration services, shared repositories, app-wide types, and runtime configuration.

## Module Standard

Each module should keep these layers separate:

- Types: request, response, and entity shapes.
- Validation: sanitization and domain validation.
- Repository: database persistence only.
- Business service: workflow rules, calculations, audit logging, transactions.
- UI: pages and components only call APIs or hooks. They should not own business rules.

`src/modules/services` is the first extracted reference implementation.

## License Flag

License enforcement is isolated behind `NEXT_PUBLIC_LICENSE_ENABLED`.

- `false`: local, preview, staging, and current production testing builds remain fully accessible.
- `true`: future production release can attach the external activation and renewal implementation without changing dashboard routes.

## Database Direction

Salon tables use explicit relationships, indexed search fields, audit fields, and transactions for billing changes that touch customers, product stock, commission, and revenue.

Future modules such as appointments, online booking, loyalty, membership plans, multi-branch support, and SaaS tenancy should plug into `src/modules` as separate domains.
