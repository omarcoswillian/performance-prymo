-- ============================================================
-- 013: Backfill & Incremental Sync Support
-- ============================================================
-- Adds columns to track backfill progress per account and
-- extends sync_log to support backfill/incremental types.

-- Track backfill progress per account
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_accounts' AND column_name = 'backfill_status'
  ) THEN
    ALTER TABLE meta_accounts ADD COLUMN backfill_status TEXT DEFAULT 'pending';
    ALTER TABLE meta_accounts ADD CONSTRAINT meta_accounts_backfill_status_check
      CHECK (backfill_status IN ('pending', 'running', 'completed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_accounts' AND column_name = 'backfill_cursor'
  ) THEN
    ALTER TABLE meta_accounts ADD COLUMN backfill_cursor DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_accounts' AND column_name = 'backfill_oldest_date'
  ) THEN
    ALTER TABLE meta_accounts ADD COLUMN backfill_oldest_date DATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_accounts' AND column_name = 'backfill_completed_at'
  ) THEN
    ALTER TABLE meta_accounts ADD COLUMN backfill_completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Allow new sync types in sync_log
ALTER TABLE meta_sync_log DROP CONSTRAINT IF EXISTS meta_sync_log_sync_type_check;
ALTER TABLE meta_sync_log ADD CONSTRAINT meta_sync_log_sync_type_check
  CHECK (sync_type IN ('structure', 'insights', 'full', 'backfill', 'incremental'));
