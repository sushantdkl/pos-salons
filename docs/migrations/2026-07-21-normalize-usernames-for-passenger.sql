-- One-time cPanel/PostgreSQL migration.
-- Keeps username lookup case-insensitive without running DDL from API requests.

BEGIN;

UPDATE users
SET username = LOWER(TRIM(username)) || '_' || id::text
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY LOWER(TRIM(username))
        ORDER BY
          CASE WHEN LOWER(TRIM(username)) = 'admin' AND role = 'admin' THEN 0 ELSE 1 END,
          id ASC
      ) AS rn
    FROM users
  ) ranked
  WHERE rn > 1
);

UPDATE users
SET username = LOWER(TRIM(username))
WHERE username IS DISTINCT FROM LOWER(TRIM(username));

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
ON users (LOWER(username));

COMMIT;
