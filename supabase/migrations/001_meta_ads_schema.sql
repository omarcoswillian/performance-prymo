-- ============================================================
-- Meta Ads Creative Monitoring - Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1) meta_accounts
-- ============================================================
CREATE TABLE meta_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,            -- "act_123456789"
  name TEXT NOT NULL DEFAULT '',
  access_token TEXT NOT NULL,             -- encrypted at app level
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active'   -- active | paused | revoked
    CHECK (status IN ('active', 'paused', 'revoked')),
  conversion_event TEXT NOT NULL DEFAULT 'offsite_conversion.fb_pixel_purchase',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ad_account_id)
);

CREATE INDEX idx_meta_accounts_user ON meta_accounts(user_id);

-- ============================================================
-- 2) meta_campaigns
-- ============================================================
CREATE TABLE meta_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, campaign_id)
);

CREATE INDEX idx_meta_campaigns_account ON meta_campaigns(ad_account_id);

-- ============================================================
-- 3) meta_adsets
-- ============================================================
CREATE TABLE meta_adsets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  optimization_goal TEXT,
  billing_event TEXT,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, adset_id)
);

CREATE INDEX idx_meta_adsets_account ON meta_adsets(ad_account_id);
CREATE INDEX idx_meta_adsets_campaign ON meta_adsets(campaign_id);

-- ============================================================
-- 4) meta_ads (creatives/ads)
-- ============================================================
CREATE TABLE meta_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  adset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  creative_id TEXT,
  preview_url TEXT,
  thumbnail_url TEXT,
  format TEXT DEFAULT 'unknown'
    CHECK (format IN ('image', 'video', 'carousel', 'unknown')),
  primary_text TEXT,
  headline TEXT,
  cta TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, ad_id)
);

CREATE INDEX idx_meta_ads_account ON meta_ads(ad_account_id);
CREATE INDEX idx_meta_ads_adset ON meta_ads(adset_id);
CREATE INDEX idx_meta_ads_campaign ON meta_ads(campaign_id);

-- ============================================================
-- 5) meta_ad_insights_daily (fact table)
-- ============================================================
CREATE TABLE meta_ad_insights_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  date DATE NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  conversion_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  cpm NUMERIC(10,4),
  cpc NUMERIC(10,4),
  ctr NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, ad_id, date)
);

CREATE INDEX idx_insights_account_date ON meta_ad_insights_daily(ad_account_id, date);
CREATE INDEX idx_insights_ad_date ON meta_ad_insights_daily(ad_id, date);
CREATE INDEX idx_insights_date ON meta_ad_insights_daily(date);

-- ============================================================
-- 6) meta_alerts
-- ============================================================
CREATE TABLE meta_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT,
  type TEXT NOT NULL
    CHECK (type IN ('no_conversions', 'ctr_fatigue', 'high_cpa', 'custom')),
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_account ON meta_alerts(ad_account_id);
CREATE INDEX idx_alerts_unresolved ON meta_alerts(ad_account_id) WHERE resolved_at IS NULL;

-- ============================================================
-- 7) meta_sync_log (for tracking sync operations)
-- ============================================================
CREATE TABLE meta_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('structure', 'insights', 'full')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_log_account ON meta_sync_log(ad_account_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Helper function: get ad_account_ids owned by current user
CREATE OR REPLACE FUNCTION get_user_ad_account_ids()
RETURNS SETOF TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ad_account_id FROM meta_accounts
  WHERE user_id = auth.uid();
$$;

-- Enable RLS on all tables
ALTER TABLE meta_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_adsets ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ad_insights_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_sync_log ENABLE ROW LEVEL SECURITY;

-- meta_accounts: user owns their accounts
CREATE POLICY "Users can view own accounts"
  ON meta_accounts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own accounts"
  ON meta_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own accounts"
  ON meta_accounts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own accounts"
  ON meta_accounts FOR DELETE
  USING (user_id = auth.uid());

-- meta_campaigns: access via ad_account_id ownership
CREATE POLICY "Users can view campaigns of own accounts"
  ON meta_campaigns FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage campaigns of own accounts"
  ON meta_campaigns FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- meta_adsets
CREATE POLICY "Users can view adsets of own accounts"
  ON meta_adsets FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage adsets of own accounts"
  ON meta_adsets FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- meta_ads
CREATE POLICY "Users can view ads of own accounts"
  ON meta_ads FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage ads of own accounts"
  ON meta_ads FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- meta_ad_insights_daily
CREATE POLICY "Users can view insights of own accounts"
  ON meta_ad_insights_daily FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage insights of own accounts"
  ON meta_ad_insights_daily FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- meta_alerts
CREATE POLICY "Users can view alerts of own accounts"
  ON meta_alerts FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage alerts of own accounts"
  ON meta_alerts FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- meta_sync_log
CREATE POLICY "Users can view sync logs of own accounts"
  ON meta_sync_log FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage sync logs of own accounts"
  ON meta_sync_log FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- ============================================================
-- Service role bypass (for cron jobs / server-side sync)
-- These policies allow the service_role key to bypass RLS
-- Supabase service_role already bypasses RLS by default,
-- so no additional policies needed for server-side operations.
-- ============================================================

-- ============================================================
-- Aggregation function for dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION get_ads_with_metrics(
  p_ad_account_id TEXT,
  p_date_start DATE,
  p_date_end DATE,
  p_campaign_id TEXT DEFAULT NULL,
  p_adset_id TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'spend',
  p_sort_dir TEXT DEFAULT 'desc',
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER;
  v_total BIGINT;
  v_data JSON;
  v_sort_column TEXT;
  v_sort_direction TEXT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  -- Validate sort column
  v_sort_column := CASE p_sort_by
    WHEN 'name' THEN 'a.name'
    WHEN 'status' THEN 'a.status'
    WHEN 'spend' THEN 'total_spend'
    WHEN 'impressions' THEN 'total_impressions'
    WHEN 'clicks' THEN 'total_clicks'
    WHEN 'ctr' THEN 'calc_ctr'
    WHEN 'conversions' THEN 'total_conversions'
    WHEN 'cpa' THEN 'calc_cpa'
    ELSE 'total_spend'
  END;

  v_sort_direction := CASE WHEN p_sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END;

  -- Count total
  SELECT COUNT(*)
  INTO v_total
  FROM meta_ads a
  WHERE a.ad_account_id = p_ad_account_id
    AND (p_campaign_id IS NULL OR a.campaign_id = p_campaign_id)
    AND (p_adset_id IS NULL OR a.adset_id = p_adset_id)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_search IS NULL OR a.name ILIKE '%' || p_search || '%');

  -- Get paginated data with aggregated metrics
  EXECUTE format(
    'SELECT json_agg(row_to_json(t))
     FROM (
       SELECT
         a.id, a.ad_id, a.name, a.status,
         a.campaign_id, a.adset_id,
         a.thumbnail_url, a.format,
         a.creative_id, a.preview_url,
         a.primary_text, a.headline, a.cta,
         c.name AS campaign_name,
         s.name AS adset_name,
         COALESCE(SUM(i.spend), 0)::numeric(12,2) AS total_spend,
         COALESCE(SUM(i.impressions), 0)::bigint AS total_impressions,
         COALESCE(SUM(i.clicks), 0)::bigint AS total_clicks,
         COALESCE(SUM(i.conversions), 0)::bigint AS total_conversions,
         COALESCE(SUM(i.conversion_value), 0)::numeric(12,2) AS total_conversion_value,
         CASE WHEN SUM(i.impressions) > 0
              THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(10,4)
              ELSE 0 END AS calc_ctr,
         CASE WHEN SUM(i.conversions) > 0
              THEN (SUM(i.spend) / SUM(i.conversions))::numeric(10,2)
              ELSE NULL END AS calc_cpa,
         CASE WHEN SUM(i.clicks) > 0
              THEN (SUM(i.spend) / SUM(i.clicks))::numeric(10,4)
              ELSE NULL END AS calc_cpc,
         CASE WHEN SUM(i.clicks) > 0
              THEN (SUM(i.conversions)::numeric / SUM(i.clicks) * 100)::numeric(10,4)
              ELSE 0 END AS calc_cvr
       FROM meta_ads a
       LEFT JOIN meta_campaigns c ON c.ad_account_id = a.ad_account_id AND c.campaign_id = a.campaign_id
       LEFT JOIN meta_adsets s ON s.ad_account_id = a.ad_account_id AND s.adset_id = a.adset_id
       LEFT JOIN meta_ad_insights_daily i ON i.ad_account_id = a.ad_account_id
         AND i.ad_id = a.ad_id
         AND i.date BETWEEN $1 AND $2
       WHERE a.ad_account_id = $3
         AND ($4::text IS NULL OR a.campaign_id = $4)
         AND ($5::text IS NULL OR a.adset_id = $5)
         AND ($6::text IS NULL OR a.status = $6)
         AND ($7::text IS NULL OR a.name ILIKE ''%%'' || $7 || ''%%'')
       GROUP BY a.id, a.ad_id, a.name, a.status, a.campaign_id, a.adset_id,
                a.thumbnail_url, a.format, a.creative_id, a.preview_url,
                a.primary_text, a.headline, a.cta,
                c.name, s.name
       ORDER BY %I %s
       LIMIT $8 OFFSET $9
     ) t',
    v_sort_column, v_sort_direction
  )
  INTO v_data
  USING p_date_start, p_date_end, p_ad_account_id,
        p_campaign_id, p_adset_id, p_status, p_search,
        p_page_size, v_offset;

  RETURN json_build_object(
    'data', COALESCE(v_data, '[]'::json),
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size,
    'total_pages', CEIL(v_total::numeric / p_page_size)
  );
END;
$$;

-- ============================================================
-- Summary metrics function
-- ============================================================
CREATE OR REPLACE FUNCTION get_account_metrics_summary(
  p_ad_account_id TEXT,
  p_date_start DATE,
  p_date_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'total_spend', COALESCE(SUM(spend), 0)::numeric(12,2),
      'total_impressions', COALESCE(SUM(impressions), 0)::bigint,
      'total_clicks', COALESCE(SUM(clicks), 0)::bigint,
      'total_conversions', COALESCE(SUM(conversions), 0)::bigint,
      'total_conversion_value', COALESCE(SUM(conversion_value), 0)::numeric(12,2),
      'ctr', CASE WHEN SUM(impressions) > 0
                  THEN (SUM(clicks)::numeric / SUM(impressions) * 100)::numeric(10,4)
                  ELSE 0 END,
      'cpa', CASE WHEN SUM(conversions) > 0
                  THEN (SUM(spend) / SUM(conversions))::numeric(10,2)
                  ELSE NULL END,
      'cpc', CASE WHEN SUM(clicks) > 0
                  THEN (SUM(spend) / SUM(clicks))::numeric(10,4)
                  ELSE NULL END,
      'cpm', CASE WHEN SUM(impressions) > 0
                  THEN (SUM(spend) / SUM(impressions) * 1000)::numeric(10,4)
                  ELSE NULL END,
      'cvr', CASE WHEN SUM(clicks) > 0
                  THEN (SUM(conversions)::numeric / SUM(clicks) * 100)::numeric(10,4)
                  ELSE 0 END
    )
    FROM meta_ad_insights_daily
    WHERE ad_account_id = p_ad_account_id
      AND date BETWEEN p_date_start AND p_date_end
  );
END;
$$;

-- ============================================================
-- Daily series function for charts
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_series(
  p_ad_account_id TEXT,
  p_date_start DATE,
  p_date_end DATE,
  p_ad_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.date)
    FROM (
      SELECT
        date,
        COALESCE(SUM(spend), 0)::numeric(12,2) AS spend,
        COALESCE(SUM(impressions), 0)::bigint AS impressions,
        COALESCE(SUM(clicks), 0)::bigint AS clicks,
        COALESCE(SUM(conversions), 0)::bigint AS conversions,
        CASE WHEN SUM(impressions) > 0
             THEN (SUM(clicks)::numeric / SUM(impressions) * 100)::numeric(10,4)
             ELSE 0 END AS ctr,
        CASE WHEN SUM(conversions) > 0
             THEN (SUM(spend) / SUM(conversions))::numeric(10,2)
             ELSE NULL END AS cpa
      FROM meta_ad_insights_daily
      WHERE ad_account_id = p_ad_account_id
        AND date BETWEEN p_date_start AND p_date_end
        AND (p_ad_id IS NULL OR ad_id = p_ad_id)
      GROUP BY date
    ) t
  );
END;
$$;
