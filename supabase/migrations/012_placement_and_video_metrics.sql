-- ============================================================
-- 012: Placement Breakdown + Video Metrics
-- ============================================================

-- 1) Placement breakdown table (per ad, per day, per platform+position)
CREATE TABLE IF NOT EXISTS meta_ad_insights_placement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  date DATE NOT NULL,
  publisher_platform TEXT NOT NULL,   -- facebook, instagram, audience_network, messenger
  platform_position TEXT NOT NULL,    -- feed, story, reels, right_hand_column, explore, etc.
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER DEFAULT NULL,
  cpm NUMERIC(10,4),
  cpc NUMERIC(10,4),
  ctr NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, ad_id, date, publisher_platform, platform_position)
);

CREATE INDEX IF NOT EXISTS idx_placement_account_date
  ON meta_ad_insights_placement(ad_account_id, date);
CREATE INDEX IF NOT EXISTS idx_placement_ad_date
  ON meta_ad_insights_placement(ad_account_id, ad_id, date);

-- RLS
ALTER TABLE meta_ad_insights_placement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view placement insights of own accounts"
  ON meta_ad_insights_placement FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage placement insights of own accounts"
  ON meta_ad_insights_placement FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- 2) Video metrics columns on the daily insights table
ALTER TABLE meta_ad_insights_daily
  ADD COLUMN IF NOT EXISTS video_views_3s INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS video_thruplay INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS video_avg_play_time NUMERIC(10,2) DEFAULT NULL;

-- 3) RPC: aggregate placement data per ad for a date range
CREATE OR REPLACE FUNCTION get_placement_breakdown(
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
    SELECT COALESCE(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_object(
        'publisher_platform', p.publisher_platform,
        'platform_position', p.platform_position,
        'impressions', COALESCE(SUM(p.impressions), 0)::bigint,
        'clicks', COALESCE(SUM(p.clicks), 0)::bigint,
        'spend', COALESCE(SUM(p.spend), 0)::numeric(12,2),
        'conversions', COALESCE(SUM(p.conversions), 0)::bigint,
        'ctr', CASE WHEN SUM(p.impressions) > 0
                    THEN (SUM(p.clicks)::numeric / SUM(p.impressions) * 100)::numeric(10,4)
                    ELSE 0 END,
        'cpa', CASE WHEN SUM(p.conversions) > 0
                    THEN (SUM(p.spend) / SUM(p.conversions))::numeric(10,2)
                    ELSE NULL END,
        'cpm', CASE WHEN SUM(p.impressions) > 0
                    THEN (SUM(p.spend) / SUM(p.impressions) * 1000)::numeric(10,4)
                    ELSE NULL END,
        'spend_pct', 0  -- calculated client-side
      ) AS row_data
      FROM meta_ad_insights_placement p
      WHERE p.ad_account_id = p_ad_account_id
        AND p.date BETWEEN p_date_start AND p_date_end
        AND (p_ad_id IS NULL OR p.ad_id = p_ad_id)
      GROUP BY p.publisher_platform, p.platform_position
      ORDER BY SUM(p.spend) DESC
    ) sub
  );
END;
$$;

-- 4) Update get_insights_by_ad to include video metrics
CREATE OR REPLACE FUNCTION get_insights_by_ad(
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
    SELECT COALESCE(json_agg(row_data), '[]'::json)
    FROM (
      SELECT json_build_object(
        'ad_id', i.ad_id,
        'impressions', COALESCE(SUM(i.impressions), 0)::bigint,
        'clicks', COALESCE(SUM(i.clicks), 0)::bigint,
        'spend', COALESCE(SUM(i.spend), 0)::numeric(12,2),
        'conversions', COALESCE(SUM(i.conversions), 0)::bigint,
        'conversion_value', COALESCE(SUM(i.conversion_value), 0)::numeric(12,2),
        'reach', COALESCE(SUM(i.reach), 0)::bigint,
        'roas', CASE WHEN SUM(i.spend) > 0 AND SUM(i.conversion_value) > 0
                     THEN (SUM(i.conversion_value) / SUM(i.spend))::numeric(10,2)
                     ELSE NULL END,
        'video_views_3s', COALESCE(SUM(i.video_views_3s), 0)::bigint,
        'video_thruplay', COALESCE(SUM(i.video_thruplay), 0)::bigint,
        'name', COALESCE(a.name, i.ad_id),
        'thumbnail_url', a.thumbnail_url,
        'format', COALESCE(a.format, 'unknown'),
        'primary_text', a.primary_text,
        'headline', a.headline,
        'cta', a.cta,
        'campaign_id', COALESCE(a.campaign_id, ''),
        'adset_id', COALESCE(a.adset_id, ''),
        'status', COALESCE(a.status, 'UNKNOWN'),
        'avg_frequency', CASE
          WHEN COUNT(i.frequency) > 0 AND AVG(i.frequency) > 0
          THEN ROUND(AVG(i.frequency)::numeric, 2)
          ELSE NULL
        END
      ) AS row_data
      FROM meta_ad_insights_daily i
      LEFT JOIN meta_ads a
        ON a.ad_account_id = i.ad_account_id AND a.ad_id = i.ad_id
      WHERE i.ad_account_id = p_ad_account_id
        AND i.date BETWEEN p_date_start AND p_date_end
      GROUP BY i.ad_id, a.name, a.thumbnail_url, a.format, a.primary_text, a.headline, a.cta,
               a.campaign_id, a.adset_id, a.status
      HAVING SUM(i.impressions) > 0
      ORDER BY SUM(i.spend) DESC
    ) sub
  );
END;
$$;
