-- Appointment system: planned customers (tokens stay the walk-in queue).
--
-- appointments            one booking; status is the appointment lifecycle only (never payment)
-- appointment_services    one or more services per appointment, each with its own duration
-- appointment_events      append-only history: created, confirmed, rescheduled, overrides ...
-- staff_working_hours     weekly hours per staff member (no rows = salon default hours)
-- staff_time_off          leave / blocked time
-- appointment_waitlist    customers waiting for a slot
-- salon_bills.appointment_id  links the ONE paid bill an appointment produced
--
-- No revenue is created here: an appointment becomes money only through the normal bill.
-- Forward-only; no existing row is changed.
BEGIN;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  appointment_number TEXT NOT NULL UNIQUE,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  source TEXT NOT NULL DEFAULT 'STAFF'
    CHECK (source IN ('WALK_IN', 'PHONE', 'WEBSITE', 'WHATSAPP', 'STAFF', 'REBOOKING')),
  notes TEXT,
  requested_service_text TEXT,
  requested_staff_text TEXT,
  token_id BIGINT REFERENCES walk_in_tokens(id) ON DELETE SET NULL,
  conflict_override_reason TEXT,
  conflict_override_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  no_show_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_appointments_date_staff ON appointments(appointment_date, staff_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments(customer_phone);

CREATE TABLE IF NOT EXISTS appointment_services (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id BIGINT REFERENCES salon_services(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_appointment_services_appt ON appointment_services(appointment_id);

CREATE TABLE IF NOT EXISTS appointment_events (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  details JSONB,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointment_events_appt ON appointment_events(appointment_id, created_at);

CREATE TABLE IF NOT EXISTS staff_working_hours (
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_off BOOLEAN NOT NULL DEFAULT FALSE,
  start_time TIME,
  end_time TIME,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (staff_id, weekday),
  CHECK (is_off OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE TABLE IF NOT EXISTS staff_time_off (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_staff_time_off_staff ON staff_time_off(staff_id, starts_at);

CREATE TABLE IF NOT EXISTS appointment_waitlist (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  requested_date DATE NOT NULL,
  preferred_time TEXT,
  preferred_staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  service_id BIGINT REFERENCES salon_services(id) ON DELETE SET NULL,
  flexibility TEXT NOT NULL DEFAULT 'SAME_DAY' CHECK (flexibility IN ('EXACT', 'SAME_DAY', 'ANY_DAY')),
  priority SMALLINT NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'BOOKED', 'REMOVED')),
  appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_date ON appointment_waitlist(status, requested_date);

-- One PAID bill per appointment. A voided bill leaves the index, so the appointment can be
-- billed again correctly after a void.
ALTER TABLE salon_bills ADD COLUMN IF NOT EXISTS appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_salon_bills_appointment_paid
  ON salon_bills(appointment_id)
  WHERE appointment_id IS NOT NULL AND status IN ('paid', 'completed');

INSERT INTO document_sequences(document_type, next_value) VALUES ('appointment', 1)
ON CONFLICT (document_type) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('salon_open_time', '09:00'),
  ('salon_close_time', '20:00'),
  ('appointment_slot_minutes', '15'),
  ('online_booking_enabled', 'true'),
  ('online_booking_instant_confirm', 'false'),
  ('online_booking_max_days_ahead', '30')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
