-- ============================================================
-- GA4 Integration Tables
-- ============================================================

-- Config: stores GA4 property ID per ad account (multi-tenant)
CREATE TABLE IF NOT EXISTS ga4_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  ga4_property_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(ad_account_id)
);

-- Daily snapshots of GA4 page metrics
CREATE TABLE IF NOT EXISTS ga4_page_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  date date NOT NULL,
  page_path text NOT NULL,
  sessions int DEFAULT 0,
  engaged_sessions int DEFAULT 0,
  engagement_rate numeric(7,4) DEFAULT 0,
  avg_engagement_time numeric(10,2) DEFAULT 0,
  conversions int DEFAULT 0,
  event_count int DEFAULT 0,
  source text DEFAULT '',
  medium text DEFAULT '',
  campaign text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(ad_account_id, date, page_path, source, medium, campaign)
);

CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_account_date
  ON ga4_page_daily(ad_account_id, date);

CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_page_path
  ON ga4_page_daily(ad_account_id, page_path);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE ga4_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ga4_page_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ga4_configs"
  ON ga4_configs FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can insert own ga4_configs"
  ON ga4_configs FOR INSERT
  WITH CHECK (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can update own ga4_configs"
  ON ga4_configs FOR UPDATE
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can view own ga4_page_daily"
  ON ga4_page_daily FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can insert own ga4_page_daily"
  ON ga4_page_daily FOR INSERT
  WITH CHECK (ad_account_id IN (SELECT get_user_ad_account_ids()));
