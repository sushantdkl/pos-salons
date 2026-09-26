-- HRM: attendance, shifts, holidays, leave, overtime, HR policy and an HR audit trail.
-- Forward-only and idempotent. Employees stay in users + staff_profiles (no new employee model).
--
-- Times: every instant is TIMESTAMPTZ; shift times are wall-clock TIME in Asia/Kathmandu.
-- attendance_date is the LOGICAL work date (the date the shift starts), not the Business Day:
-- a 6 PM–2 AM shift belongs to the evening it started.

BEGIN;

CREATE TABLE IF NOT EXISTS hr_shifts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,                      -- end <= start means the shift ends the next day
  grace_minutes INTEGER NOT NULL DEFAULT 0 CHECK (grace_minutes BETWEEN 0 AND 240),
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 480),
  working_days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',   -- 0 = Sunday … 6 = Saturday
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_time <> end_time),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_shifts_name_active ON hr_shifts(LOWER(name)) WHERE is_active;

-- Shift history. DEFAULT rows never overlap per employee (a new one closes the previous);
-- DATE rows override a single day (a different shift, or a day off when shift_id IS NULL).
CREATE TABLE IF NOT EXISTS hr_shift_assignments (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id BIGINT REFERENCES hr_shifts(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL DEFAULT 'DEFAULT' CHECK (kind IN ('DEFAULT', 'DATE')),
  effective_from DATE NOT NULL,
  effective_to DATE,
  off_days SMALLINT[],                          -- NULL = use the shift's working days
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (kind = 'DEFAULT' OR (effective_to = effective_from)),
  CHECK (kind = 'DATE' OR shift_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_hr_shift_assignments_staff ON hr_shift_assignments(staff_id, kind, effective_from);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_shift_assignments_date ON hr_shift_assignments(staff_id, effective_from) WHERE kind = 'DATE';

CREATE TABLE IF NOT EXISTS hr_holidays (
  id BIGSERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_attendance (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attendance_date DATE NOT NULL,
  shift_id BIGINT REFERENCES hr_shifts(id) ON DELETE SET NULL,
  -- What the day was when the record was made: a normal shift day, a day off, a holiday, or
  -- no shift assigned. Off days / holidays make all worked time potential overtime (policy).
  day_type TEXT NOT NULL DEFAULT 'WORKING' CHECK (day_type IN ('WORKING', 'OFF_DAY', 'HOLIDAY', 'UNSCHEDULED')),
  -- Schedule snapshot taken when the record is created, so later shift edits never rewrite history.
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  scheduled_break_minutes INTEGER NOT NULL DEFAULT 0,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  worked_minutes INTEGER NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
  late_minutes INTEGER NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
  early_leave_minutes INTEGER NOT NULL DEFAULT 0 CHECK (early_leave_minutes >= 0),
  overtime_minutes INTEGER NOT NULL DEFAULT 0 CHECK (overtime_minutes >= 0),   -- POTENTIAL; payroll uses hr_overtime.approved_minutes
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'OFF_DAY', 'MISSING_PUNCH')),
  status_locked BOOLEAN NOT NULL DEFAULT FALSE,    -- TRUE when HR set the status explicitly (half day, absent override …)
  half_day_reason TEXT CHECK (half_day_reason IS NULL OR half_day_reason IN ('APPROVED_LEAVE', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'MANUAL')),
  late_excused BOOLEAN NOT NULL DEFAULT FALSE,
  early_leave_approved BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL CHECK (source IN ('MANUAL', 'ADMIN', 'EMPLOYEE', 'DEVICE', 'IMPORT', 'BIOMETRIC', 'QR', 'PIN')),
  notes TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (clock_out IS NULL OR clock_in IS NOT NULL),
  CHECK (clock_out IS NULL OR clock_out > clock_in)
);
-- One attendance session per employee per logical work date, and never two open sessions.
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_attendance_staff_date ON hr_attendance(staff_id, attendance_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_attendance_open ON hr_attendance(staff_id) WHERE clock_in IS NOT NULL AND clock_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date ON hr_attendance(attendance_date);

CREATE TABLE IF NOT EXISTS hr_attendance_breaks (
  id BIGSERIAL PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES hr_attendance(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_attendance_breaks_open ON hr_attendance_breaks(attendance_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS hr_leave_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  annual_allocation_days NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (annual_allocation_days >= 0),
  carry_forward BOOLEAN NOT NULL DEFAULT FALSE,
  max_carry_forward_days NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (max_carry_forward_days >= 0),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  document_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_leave_types_name ON hr_leave_types(LOWER(name));

CREATE TABLE IF NOT EXISTS hr_leave_requests (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  leave_type_id BIGINT NOT NULL REFERENCES hr_leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  partial_day TEXT NOT NULL DEFAULT 'FULL' CHECK (partial_day IN ('FULL', 'FIRST_HALF', 'SECOND_HALF')),
  days NUMERIC(6,1) NOT NULL CHECK (days >= 0),   -- working days, computed server-side
  reason TEXT,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  time_off_id BIGINT REFERENCES staff_time_off(id) ON DELETE SET NULL,   -- blocks online booking while on leave
  CHECK (end_date >= start_date),
  CHECK (partial_day = 'FULL' OR start_date = end_date)
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_staff ON hr_leave_requests(staff_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_status ON hr_leave_requests(status, start_date);

-- Auditable balance: balance = SUM(days). Nothing stores a mutable "remaining" number.
CREATE TABLE IF NOT EXISTS hr_leave_ledger (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  leave_type_id BIGINT NOT NULL REFERENCES hr_leave_types(id) ON DELETE RESTRICT,
  leave_year INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ALLOCATION', 'CARRY_FORWARD', 'USAGE', 'REVERSAL', 'ADJUSTMENT')),
  days NUMERIC(6,1) NOT NULL,
  leave_request_id BIGINT REFERENCES hr_leave_requests(id) ON DELETE RESTRICT,
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_ledger_staff ON hr_leave_ledger(staff_id, leave_type_id, leave_year);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_leave_ledger_allocation ON hr_leave_ledger(staff_id, leave_type_id, leave_year) WHERE entry_type = 'ALLOCATION';
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_leave_ledger_carry ON hr_leave_ledger(staff_id, leave_type_id, leave_year) WHERE entry_type = 'CARRY_FORWARD';

CREATE TABLE IF NOT EXISTS hr_overtime (
  id BIGSERIAL PRIMARY KEY,
  staff_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attendance_id BIGINT REFERENCES hr_attendance(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ATTENDANCE', 'REQUEST')),
  scheduled_minutes INTEGER NOT NULL DEFAULT 0 CHECK (scheduled_minutes >= 0),
  worked_minutes INTEGER NOT NULL DEFAULT 0 CHECK (worked_minutes >= 0),
  potential_minutes INTEGER NOT NULL DEFAULT 0 CHECK (potential_minutes >= 0),
  requested_minutes INTEGER NOT NULL DEFAULT 0 CHECK (requested_minutes >= 0),
  approved_minutes INTEGER NOT NULL DEFAULT 0 CHECK (approved_minutes >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reason TEXT,
  requested_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status = 'APPROVED' OR approved_minutes = 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_overtime_attendance ON hr_overtime(attendance_id) WHERE attendance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_overtime_staff_date ON hr_overtime(staff_id, work_date);

-- One-row policy table. Every payroll effect is OFF until the owner turns it on.
CREATE TABLE IF NOT EXISTS hr_policy (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  overtime_threshold_minutes INTEGER NOT NULL DEFAULT 15 CHECK (overtime_threshold_minutes >= 0),
  overtime_on_off_days BOOLEAN NOT NULL DEFAULT TRUE,          -- all time worked on an off day / holiday is potential overtime
  auto_deduct_scheduled_break BOOLEAN NOT NULL DEFAULT TRUE,   -- when no break was punched, deduct the shift's break
  missing_punch_after_minutes INTEGER NOT NULL DEFAULT 240 CHECK (missing_punch_after_minutes >= 0),
  overtime_pay_mode TEXT NOT NULL DEFAULT 'NONE' CHECK (overtime_pay_mode IN ('NONE', 'MULTIPLIER', 'FIXED_HOURLY')),
  overtime_multiplier NUMERIC(6,2) NOT NULL DEFAULT 1.00 CHECK (overtime_multiplier >= 0),
  overtime_fixed_hourly_rate NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (overtime_fixed_hourly_rate >= 0),
  deduct_absent_days BOOLEAN NOT NULL DEFAULT FALSE,
  deduct_unpaid_leave BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_deduction_factor NUMERIC(4,2) NOT NULL DEFAULT 0.50 CHECK (half_day_deduction_factor BETWEEN 0 AND 1),
  deduct_half_days BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO hr_policy(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,          -- attendance | shift | shift_assignment | leave_request | leave_type | leave_ledger | holiday | overtime | policy
  entity_id BIGINT,
  staff_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_audit_entity ON hr_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_hr_audit_staff ON hr_audit_log(staff_id, created_at DESC);

ALTER TABLE staff_time_off ADD COLUMN IF NOT EXISTS leave_request_id BIGINT REFERENCES hr_leave_requests(id) ON DELETE SET NULL;

-- Payroll keeps its own maths; this only records which attendance inputs a settlement used.
ALTER TABLE salary_payments ADD COLUMN IF NOT EXISTS attendance_snapshot JSONB;

-- Default leave types (editable; allocations start at 0 until the owner sets them).
INSERT INTO hr_leave_types(name, is_paid, annual_allocation_days, carry_forward, requires_approval)
SELECT v.name, v.is_paid, 0, FALSE, TRUE
FROM (VALUES ('Annual Leave', TRUE), ('Sick Leave', TRUE), ('Casual Leave', TRUE), ('Unpaid Leave', FALSE), ('Other', FALSE)) v(name, is_paid)
WHERE NOT EXISTS (SELECT 1 FROM hr_leave_types t WHERE LOWER(t.name) = LOWER(v.name));

-- HRM permissions: denied for every non-admin role, except requesting one's own leave.
INSERT INTO role_permissions(role, permission_key, allowed)
SELECT role_name, permission_key, FALSE
FROM (VALUES ('cashier'), ('barber'), ('stylist'), ('beautician')) roles(role_name)
CROSS JOIN (VALUES
  ('attendance.view'), ('attendance.create'), ('attendance.edit'), ('attendance.correct'), ('attendance.approve'),
  ('shift.manage'), ('leave.view'), ('leave.request'), ('leave.approve'), ('overtime.view'), ('overtime.approve')
) permissions(permission_key)
ON CONFLICT (role, permission_key) DO NOTHING;

UPDATE role_permissions SET allowed = TRUE
WHERE permission_key = 'leave.request' AND role IN ('cashier', 'barber', 'stylist', 'beautician')
  AND updated_by IS NULL;

COMMIT;
