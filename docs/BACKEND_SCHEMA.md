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
- `token_id`: integer, optional walk-in token reference.
- `transaction_time`: datetime.
- `is_printed`: integer boolean. `0` for digital bills, `1` for Bill & Print.
- `printed_at`: datetime, set only when Bill & Print is used.
- `printed_by`: integer user ID, set only when Bill & Print is used.
- `notes`: text, optional.
- `status`: text enum. Values: paid, cancelled.
- `created_at`: datetime.

Relationships:

- One invoice belongs to one customer when known.
- One invoice has many invoice items.
- Cashier references user.
- Optional token references walk-in token.

Validation:

- Totals cannot be negative.
- Payment method must be valid.
- Amount paid must cover total unless split payment is supported.

Indexes:

- Unique index on `bill_number`.
- Recommended indexes on `created_at`, `customer_id`, `cashier_id`, `token_id`, and `payment_method`.

## WalkInToken

Physical table: `walk_in_tokens`.

Fields:

- `id`: integer primary key.
- `token_number`: text, required. Daily sequence such as `TKN-001`.
- `token_date`: date, required.
- `customer_id`: integer, optional.
- `customer_name`: text, optional.
- `customer_phone`: text, optional.
- `service_id`: integer, required.
- `package_id`: integer, optional.
- `assigned_staff_id`: integer, optional.
- `status`: text enum. Values: WAITING, BILLED, CANCELLED, NO_SHOW.
- `people_ahead`: integer.
- `estimated_wait_minutes_min`: integer.
- `estimated_wait_minutes_max`: integer.
- `created_by`: integer user ID.
- `billed_at`, `cancelled_at`, `no_show_at`: datetime lifecycle timestamps.
- `invoice_id`: integer, optional.
- `is_printed`: integer boolean. `0` for digital tokens, `1` for Generate & Print Token.
- `printed_at`: datetime, set only when token printing is requested.
- `printed_by`: integer user ID, set only when token printing is requested.
- `notes`: text, optional.
- `created_at`: datetime.
- `updated_at`: datetime.

Relationships:

- Token references a service/package and optional assigned staff.
- Token can link to one invoice after billing.
- Created by admin or cashier.

Validation:

- Token number is unique per date.
- Cancelled or no-show tokens cannot be billed.
- Billed tokens cannot be billed again.
- Staff queue is read-only and shows assigned WAITING tokens only.
- Staff performance updates when the bill is created, not from token status changes.

Indexes:

- `token_date`
- `token_number`
- `status`
- `assigned_staff_id`
- `invoice_id`
- `created_at`

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

## WebsiteContent

Physical table: `website_content`.

Fields:

- `id`: integer primary key.
- `section_key`: text unique key. Values include hero, about, services, packages, staff, contact, and seo.
- `title`, `subtitle`, `description`: public website copy.
- `image_url`: public asset or remote image URL.
- `button_text`, `button_link`: primary CTA.
- `secondary_button_text`, `secondary_button_link`: secondary CTA.
- `is_visible`: integer boolean controlling section visibility.
- `sort_order`: integer display order.
- `metadata`: JSON text for section-specific data such as contact details, social links, map embed, highlights, SEO keywords, and Open Graph text.
- `created_at`, `updated_at`: audit timestamps.
- `updated_by`: admin user ID.

Validation:

- Only admin users can update CMS content.
- Text input is sanitized before storage/output.
- Google Map embeds must resolve to `https://www.google.com/maps/embed`.

## WebsiteGalleryImage

Physical table: `website_gallery_images`.

Fields:

- `id`: integer primary key.
- `image_url`: required public asset or remote image URL.
- `title`: optional display title.
- `alt_text`: image alt text.
- `category`: optional gallery grouping.
- `description`: optional public caption.
- `sort_order`: integer order.
- `is_visible`: integer boolean.
- `created_at`, `updated_at`: audit timestamps.
- `updated_by`: admin user ID.

Additional public website fields:

- `salon_services.show_on_website`
- `salon_services.featured_on_website`
- `salon_services.website_image`
- `salon_services.website_description`
- `staff_profiles.show_on_website`
- `staff_profiles.featured_on_website`
- `staff_profiles.website_title`
- `staff_profiles.website_bio`
- `staff_profiles.website_photo`

These fields control public website presentation only. Private staff PINs, salary, commission, phone, and performance data are not exposed publicly.
