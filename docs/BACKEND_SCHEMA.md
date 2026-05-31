# Salon POS Backend Schema

This document describes the logical backend entities. Physical SQLite names may use `salon_*` prefixes where useful.

## User

Fields:

- `id`: integer primary key.
- `username`: text, unique, required.
- `password_hash`: text, required.
- `full_name`: text, required.
- `role`: text enum, required. Values: `admin`, `cashier`, `barber`, `stylist`, `beautician`.
- `email`: text, optional.
- `phone`: text, optional.
- `is_active`: integer boolean.
- `created_at`: datetime.
- `updated_at`: datetime.

Relationships:

- One user can have one staff profile.
- One user can create bills as cashier.
- One user can be assigned to many service invoice items.
- One user can create audit logs.

Validation:

- Username must be unique.
- PIN/password must be hashed.
- Role must be one of the supported roles.
- Inactive users cannot log in.

Indexes:

- Unique index on `username`.
- Recommended index on `role`.

## Role

Roles are stored as constrained text values on users and staff profiles.

Values:

- `admin`
- `cashier`
- `barber`
- `stylist`
- `beautician`

Validation:

- Unsupported roles are rejected or normalized before persistence.

## Customer

Fields:

- `id`: integer primary key.
- `name`: text, required.
- `phone`: text, unique, optional.
- `email`: text, optional.
- `address`: text, optional.
- `gender`: text, optional.
- `favorite_services`: text, optional.
- `preferred_barber_id`: integer, optional.
- `preferred_stylist_id`: integer, optional.
- `preferred_beautician_id`: integer, optional.
- `customer_category`: text. Values: New Customer, Returning Customer, VIP Customer.
- `notes`: text, optional.
- `total_visits`: integer.
- `total_spent`: real.
- `created_at`: datetime.
- `updated_at`: datetime.

Relationships:

- One customer can have many invoices.
- Preferred staff IDs reference users.

Validation:

- Name is required.
- Phone should be unique when supplied.
- Spending and visit totals cannot be negative.

Indexes:

- Unique index on `phone`.
- Recommended search indexes on `name` and `phone`.

## Service

Fields:

- `id`: integer primary key.
- `name`: text, required.
- `category`: text enum. Values: Haircut, Hair Color, Facial, Beard, Treatment, Makeup, Spa, Other.
- `price`: real, required.
- `duration_minutes`: integer, required.
- `assigned_staff_ids`: text, optional.
- `description`: text, optional.
- `is_package`: integer boolean.
- `package_items`: text, optional comma-separated included service names.
- `is_active`: integer boolean.
- `created_at`: datetime.
- `updated_at`: datetime.

Relationships:

- One service can appear in many invoice items.
- Assigned staff IDs reference users logically.
- Packages are stored as grouped service records for fast billing.

Validation:

- Name and category are required.
- Price must be zero or greater.
- Duration must be greater than zero.
- Package records should include package item names.

Indexes:

- Recommended indexes on `category`, `is_active`, and `name`.

## Invoice

Physical table: `salon_bills`.

Fields:

- `id`: integer primary key.
- `bill_number`: text, unique, required.
- `customer_id`: integer, optional.
- `customer_name`: text.
- `customer_phone`: text.
- `subtotal`: real.
- `discount_amount`: real.
- `discount_type`: text enum. Values: amount, percentage.
- `tax`: real.
- `tax_percent`: real.
- `service_charge`: real.
- `grand_total`: real.
- `payment_method`: text enum. Values: cash, card, online, split.
- `amount_paid`: real.
- `cashier_id`: integer, optional.
- `notes`: text, optional.
- `status`: text enum. Values: paid, cancelled.
- `created_at`: datetime.

Relationships:

- One invoice belongs to one customer when known.
- One invoice has many invoice items.
- Cashier references user.

Validation:

- Totals cannot be negative.
- Payment method must be valid.
- Amount paid must cover total unless split payment is supported.

Indexes:

- Unique index on `bill_number`.
- Recommended indexes on `created_at`, `customer_id`, `cashier_id`, and `payment_method`.

## InvoiceItem

Physical table: `salon_bill_items`.

Fields:

- `id`: integer primary key.
- `bill_id`: integer, required.
- `item_type`: text enum. Values: service, product.
- `item_id`: integer, required.
- `name`: text, required.
- `quantity`: integer.
- `unit_price`: real.
- `subtotal`: real.
- `staff_id`: integer, optional for products and required for services.
- `commission_percentage`: real.
- `commission_amount`: real.
- `created_at`: datetime.

Relationships:

- Belongs to one invoice.
- Service items reference staff user.
- Product items reference inventory product logically through `item_id`.

Validation:

- Quantity must be greater than zero.
- Prices and subtotal cannot be negative.
- Service items require staff assignment.

Indexes:

- Recommended indexes on `bill_id`, `item_type`, `item_id`, `staff_id`, and `created_at`.

## StaffPerformance

Staff performance is calculated from invoice items and invoices rather than stored as a separate source of truth.

Derived fields:

- `services_completed`
- `customers_served`
- `service_revenue`
- `commission_earned`
- `average_services_per_day`
- `average_revenue_per_day`

Relationships:

- Staff performance derives from users, staff profiles, invoices, and invoice items.

Validation:

- Only paid service invoice items count.
- Kanchan uses login role `cashier` and staff profile role `beautician`; staff performance is based on staff profile/service assignment, not only login role.

Indexes:

- Recommended indexes on invoice item `staff_id`, `item_type`, and `created_at`.

## Commission

Commission is calculated per service invoice item.

Fields:

- `staff_id`: integer.
- `commission_percentage`: real.
- `service_revenue`: real.
- `commission_amount`: real.
- `created_at`: datetime.

Formula:

```text
commission_amount = service_revenue * commission_percentage / 100
```

Validation:

- Commission percentage must be between 0 and 100.
- Commission amount cannot be negative.

## InventoryProduct

Physical table: `salon_products`.

Fields:

- `id`: integer primary key.
- `name`: text, required.
- `category`: text, required.
- `purchase_price`: real.
- `selling_price`: real.
- `current_stock`: integer.
- `low_stock_threshold`: integer.
- `supplier`: text, optional.
- `expiry_date`: date, optional.
- `status`: text enum. Values: active, inactive.
- `created_at`: datetime.
- `updated_at`: datetime.

Relationships:

- One product can have many inventory movements.
- One product can appear in many invoice items.

Validation:

- Product name and category are required.
- Prices cannot be negative.
- Stock and threshold cannot be negative.

Indexes:

- Recommended indexes on `name`, `category`, `status`, and low stock fields.

## InventoryMovement

Fields:

- `id`: integer primary key.
- `product_id`: integer, required.
- `movement_type`: text enum. Values: stock_in, stock_out, sale, adjustment.
- `quantity`: integer, required.
- `previous_stock`: integer.
- `new_stock`: integer.
- `notes`: text, optional.
- `created_at`: datetime.

Relationships:

- Belongs to one inventory product.

Validation:

- Quantity must be greater than zero.
- New stock cannot be negative.

Indexes:

- Recommended indexes on `product_id`, `movement_type`, and `created_at`.

## Reminder

Current reminders are generated manually and are not persisted as a full scheduling system yet.

Logical fields for future persistence:

- `id`: integer primary key.
- `customer_id`: integer.
- `phone`: text.
- `channel`: text. Values: whatsapp, sms.
- `message`: text.
- `status`: text.
- `sent_by`: integer user ID.
- `created_at`: datetime.

Relationships:

- Belongs to customer when known.
- Created by a user.

Validation:

- Phone is required.
- Message must be sanitized.

Indexes:

- Recommended indexes on `customer_id`, `phone`, `channel`, and `created_at`.

## AuditLog

Physical table: `action_logs`.

Fields:

- `id`: integer primary key.
- `user_id`: integer, optional.
- `action`: text, required.
- `entity_type`: text.
- `entity_id`: integer.
- `details`: text.
- `created_at`: datetime.

Relationships:

- User references the actor when available.

Validation:

- Action is required.
- Details should not contain sensitive secrets.

Indexes:

- Recommended indexes on `user_id`, `entity_type`, `entity_id`, and `created_at`.
