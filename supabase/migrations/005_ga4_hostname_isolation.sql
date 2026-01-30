-- Add hostname column to ga4_page_daily for cached data filtering.
-- Hostnames are auto-detected from meta_creative_page_map landing page URLs.
ALTER TABLE ga4_page_daily ADD COLUMN IF NOT EXISTS hostname TEXT DEFAULT NULL;

-- Create index for efficient hostname filtering
CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_hostname
  ON ga4_page_daily (ad_account_id, hostname, date);

COMMENT ON COLUMN ga4_page_daily.hostname IS 'Hostname from GA4 hostName dimension. Auto-matched against landing page URLs in meta_creative_page_map for client isolation.';
