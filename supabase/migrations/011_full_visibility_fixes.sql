-- ============================================================
-- 011: Full Ad Manager Visibility + Schema Fixes
-- ============================================================

-- 1) Add reach column to insights
ALTER TABLE meta_ad_insights_daily
  ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT NULL;

-- 2) Add budget fields to campaigns
ALTER TABLE meta_campaigns
  ADD COLUMN IF NOT EXISTS daily_budget NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bid_strategy TEXT DEFAULT NULL;

-- 3) Add budget fields to adsets
ALTER TABLE meta_adsets
  ADD COLUMN IF NOT EXISTS daily_budget NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lifetime_budget NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bid_strategy TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bid_amount NUMERIC(12,2) DEFAULT NULL;

-- 4) Add alert type for frequency_fatigue
ALTER TABLE meta_alerts DROP CONSTRAINT IF EXISTS meta_alerts_type_check;
ALTER TABLE meta_alerts
  ADD CONSTRAINT meta_alerts_type_check
  CHECK (type IN ('no_conversions', 'ctr_fatigue', 'high_cpa', 'frequency_fatigue', 'custom'));

-- 5) Add composite index for insights upsert performance
CREATE INDEX IF NOT EXISTS idx_insights_account_ad_date
  ON meta_ad_insights_daily(ad_account_id, ad_id, date);

-- 6) Add missing RLS policies for ga4 tables
DO $$
BEGIN
  -- ga4_configs DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ga4_configs' AND policyname = 'Users can delete own ga4_configs'
  ) THEN
    CREATE POLICY "Users can delete own ga4_configs"
      ON ga4_configs FOR DELETE
      USING (ad_account_id IN (SELECT get_user_ad_account_ids()));
  END IF;

  -- ga4_page_daily UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ga4_page_daily' AND policyname = 'Users can update own ga4_page_daily'
  ) THEN
    CREATE POLICY "Users can update own ga4_page_daily"
      ON ga4_page_daily FOR UPDATE
      USING (ad_account_id IN (SELECT get_user_ad_account_ids()));
  END IF;

  -- ga4_page_daily DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ga4_page_daily' AND policyname = 'Users can delete own ga4_page_daily'
  ) THEN
    CREATE POLICY "Users can delete own ga4_page_daily"
      ON ga4_page_daily FOR DELETE
      USING (ad_account_id IN (SELECT get_user_ad_account_ids()));
  END IF;
END $$;

-- 7) Update get_insights_by_ad to include conversion_value, reach, ROAS
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

-- 8) Update daily totals to include conversion_value and ROAS
CREATE OR REPLACE FUNCTION get_insights_daily_totals(
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
        'date', i.date,
        'impressions', COALESCE(SUM(i.impressions), 0)::bigint,
        'clicks', COALESCE(SUM(i.clicks), 0)::bigint,
        'spend', COALESCE(SUM(i.spend), 0)::numeric(12,2),
        'conversions', COALESCE(SUM(i.conversions), 0)::bigint,
        'conversion_value', COALESCE(SUM(i.conversion_value), 0)::numeric(12,2),
        'cpa', CASE WHEN SUM(i.conversions) > 0
                    THEN (SUM(i.spend) / SUM(i.conversions))::numeric(10,2)
                    ELSE NULL END,
        'ctr', CASE WHEN SUM(i.impressions) > 0
                    THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(10,4)
                    ELSE 0 END,
        'roas', CASE WHEN SUM(i.spend) > 0 AND SUM(i.conversion_value) > 0
                     THEN (SUM(i.conversion_value) / SUM(i.spend))::numeric(10,2)
                     ELSE NULL END
      ) AS row_data
      FROM meta_ad_insights_daily i
      WHERE i.ad_account_id = p_ad_account_id
        AND i.date BETWEEN p_date_start AND p_date_end
      GROUP BY i.date
      ORDER BY i.date ASC
    ) sub
  );
END;
$$;

-- 9) Update account summary to include ROAS
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
      'total_reach', COALESCE(SUM(reach), 0)::bigint,
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
                  ELSE 0 END,
      'roas', CASE WHEN SUM(spend) > 0 AND SUM(conversion_value) > 0
                   THEN (SUM(conversion_value) / SUM(spend))::numeric(10,2)
                   ELSE NULL END
    )
    FROM meta_ad_insights_daily
    WHERE ad_account_id = p_ad_account_id
      AND date BETWEEN p_date_start AND p_date_end
  );
END;
$$;

-- 10) Update daily series to include conversion_value and ROAS
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
        COALESCE(SUM(conversion_value), 0)::numeric(12,2) AS conversion_value,
        CASE WHEN SUM(impressions) > 0
             THEN (SUM(clicks)::numeric / SUM(impressions) * 100)::numeric(10,4)
             ELSE 0 END AS ctr,
        CASE WHEN SUM(conversions) > 0
             THEN (SUM(spend) / SUM(conversions))::numeric(10,2)
             ELSE NULL END AS cpa,
        CASE WHEN SUM(spend) > 0 AND SUM(conversion_value) > 0
             THEN (SUM(conversion_value) / SUM(spend))::numeric(10,2)
             ELSE NULL END AS roas
      FROM meta_ad_insights_daily
      WHERE ad_account_id = p_ad_account_id
        AND date BETWEEN p_date_start AND p_date_end
        AND (p_ad_id IS NULL OR ad_id = p_ad_id)
      GROUP BY date
    ) t
  );
END;
$$;
