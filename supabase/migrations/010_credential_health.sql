-- ============================================================
-- Add credential health tracking to meta_accounts
--
-- Supports System User Access Tokens (never expire) alongside
-- regular User Access Tokens (expire every 60 days).
-- ============================================================

-- Distinguish token type: 'user' (expires) vs 'system_user' (permanent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_accounts' AND column_name = 'credential_type'
  ) THEN
    ALTER TABLE meta_accounts
      ADD COLUMN credential_type TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE meta_accounts
      ADD CONSTRAINT chk_credential_type CHECK (credential_type IN ('user', 'system_user'));
  END IF;
END $$;

-- Proactive token health status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_accounts' AND column_name = 'credential_health'
  ) THEN
    ALTER TABLE meta_accounts
      ADD COLUMN credential_health TEXT NOT NULL DEFAULT 'unknown';
    ALTER TABLE meta_accounts
      ADD CONSTRAINT chk_credential_health CHECK (credential_health IN ('healthy', 'degraded', 'expired', 'unknown'));
  END IF;
END $$;

-- Timestamp of last health check
ALTER TABLE meta_accounts
  ADD COLUMN IF NOT EXISTS credential_checked_at TIMESTAMPTZ;
