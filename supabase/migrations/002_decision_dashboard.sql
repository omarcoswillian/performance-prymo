-- ============================================================
-- Decision Dashboard - Additional tables and columns
-- ============================================================

-- 1) Add frequency to insights
ALTER TABLE meta_ad_insights_daily
  ADD COLUMN IF NOT EXISTS frequency NUMERIC(8,4);

-- 2) Account-level settings (benchmarks, targets)
CREATE TABLE IF NOT EXISTS meta_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL UNIQUE,
  cpa_target NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  ctr_benchmark_mode TEXT NOT NULL DEFAULT 'account_avg'
    CHECK (ctr_benchmark_mode IN ('account_avg', 'campaign_avg', 'fixed')),
  ctr_benchmark_fixed NUMERIC(8,4) DEFAULT 1.00,
  min_spend_threshold NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  frequency_warn NUMERIC(4,2) NOT NULL DEFAULT 2.2,
  frequency_kill NUMERIC(4,2) NOT NULL DEFAULT 2.8,
  cpa_kill_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meta_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view settings of own accounts"
  ON meta_settings FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage settings of own accounts"
  ON meta_settings FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- 3) Manual status overrides
CREATE TABLE IF NOT EXISTS meta_ad_status_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  forced_status TEXT NOT NULL DEFAULT 'FORÇADO'
    CHECK (forced_status IN ('ESCALAR', 'VARIAR', 'MATAR', 'FORÇADO')),
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, ad_id)
);

ALTER TABLE meta_ad_status_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view overrides of own accounts"
  ON meta_ad_status_overrides FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage overrides of own accounts"
  ON meta_ad_status_overrides FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- 4) Pages table (web performance / CRO)
CREATE TABLE IF NOT EXISTS meta_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  connect_rate NUMERIC(8,4),        -- % of sessions that actually connected
  conversion_rate NUMERIC(8,4),     -- % conversion
  load_time_ms INTEGER,             -- page load in milliseconds
  sessions INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  status TEXT DEFAULT 'OK'
    CHECK (status IN ('OK', 'OTIMIZAR', 'TRAVAR TRÁFEGO')),
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, url)
);

ALTER TABLE meta_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pages of own accounts"
  ON meta_pages FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage pages of own accounts"
  ON meta_pages FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- 5) Creative × Page mapping
CREATE TABLE IF NOT EXISTS meta_creative_page_map (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, ad_id, page_url)
);

ALTER TABLE meta_creative_page_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view creative_page_map of own accounts"
  ON meta_creative_page_map FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage creative_page_map of own accounts"
  ON meta_creative_page_map FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

-- 6) Decision query: creatives with decision metrics
CREATE OR REPLACE FUNCTION get_creatives_command(
  p_ad_account_id TEXT,
  p_date_start DATE,
  p_date_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_data JSON;
  v_ctr_benchmark NUMERIC;
  v_settings RECORD;
BEGIN
  -- Load settings
  SELECT * INTO v_settings
  FROM meta_settings
  WHERE ad_account_id = p_ad_account_id;

  -- Default settings if none exist
  IF v_settings IS NULL THEN
    v_settings := ROW(
      NULL, p_ad_account_id,
      50.00,          -- cpa_target
      'account_avg',  -- ctr_benchmark_mode
      1.00,           -- ctr_benchmark_fixed
      20.00,          -- min_spend_threshold
      2.2,            -- frequency_warn
      2.8,            -- frequency_kill
      1.3,            -- cpa_kill_multiplier
      now(), now()
    )::meta_settings;
  END IF;

  -- Calculate CTR benchmark
  IF v_settings.ctr_benchmark_mode = 'fixed' THEN
    v_ctr_benchmark := v_settings.ctr_benchmark_fixed;
  ELSE
    SELECT CASE WHEN SUM(impressions) > 0
                THEN (SUM(clicks)::numeric / SUM(impressions) * 100)
                ELSE 1.0 END
    INTO v_ctr_benchmark
    FROM meta_ad_insights_daily
    WHERE ad_account_id = p_ad_account_id
      AND date BETWEEN p_date_start AND p_date_end;
  END IF;

  SELECT json_agg(row_to_json(t))
  INTO v_data
  FROM (
    SELECT
      a.ad_id,
      a.name,
      a.thumbnail_url,
      a.format,
      a.campaign_id,
      c.name AS campaign_name,
      COALESCE(SUM(i.clicks)::numeric / NULLIF(SUM(i.impressions), 0) * 100, 0)::numeric(8,4) AS ctr,
      COALESCE(SUM(i.conversions), 0)::int AS compras,
      CASE WHEN SUM(i.conversions) > 0
           THEN (SUM(i.spend) / SUM(i.conversions))::numeric(10,2)
           ELSE NULL END AS cpa,
      COALESCE(AVG(i.frequency), 0)::numeric(4,2) AS frequency,
      COALESCE(SUM(i.spend), 0)::numeric(10,2) AS spend,
      COALESCE(SUM(i.impressions), 0)::bigint AS impressions,
      COALESCE(SUM(i.clicks), 0)::bigint AS clicks,
      -- CPC / CPM for diagnostic
      CASE WHEN SUM(i.clicks) > 0
           THEN (SUM(i.spend) / SUM(i.clicks))::numeric(10,4)
           ELSE NULL END AS cpc,
      CASE WHEN SUM(i.impressions) > 0
           THEN (SUM(i.spend) / SUM(i.impressions) * 1000)::numeric(10,4)
           ELSE NULL END AS cpm,
      -- Override
      o.forced_status,
      o.note AS override_note,
      -- Benchmark reference
      v_ctr_benchmark AS ctr_benchmark,
      v_settings.cpa_target AS cpa_target,
      v_settings.frequency_warn AS freq_warn,
      v_settings.frequency_kill AS freq_kill,
      v_settings.cpa_kill_multiplier AS cpa_kill_mult,
      v_settings.min_spend_threshold AS min_spend
    FROM meta_ads a
    LEFT JOIN meta_campaigns c
      ON c.ad_account_id = a.ad_account_id AND c.campaign_id = a.campaign_id
    LEFT JOIN meta_ad_insights_daily i
      ON i.ad_account_id = a.ad_account_id AND i.ad_id = a.ad_id
      AND i.date BETWEEN p_date_start AND p_date_end
    LEFT JOIN meta_ad_status_overrides o
      ON o.ad_account_id = a.ad_account_id AND o.ad_id = a.ad_id
    WHERE a.ad_account_id = p_ad_account_id
      AND a.status = 'ACTIVE'
    GROUP BY a.ad_id, a.name, a.thumbnail_url, a.format, a.campaign_id,
             c.name, o.forced_status, o.note
    HAVING SUM(i.impressions) > 0
    ORDER BY COALESCE(SUM(i.spend), 0) DESC
  ) t;

  RETURN json_build_object(
    'creatives', COALESCE(v_data, '[]'::json),
    'ctr_benchmark', v_ctr_benchmark,
    'cpa_target', v_settings.cpa_target,
    'frequency_warn', v_settings.frequency_warn,
    'frequency_kill', v_settings.frequency_kill,
    'cpa_kill_multiplier', v_settings.cpa_kill_multiplier,
    'min_spend', v_settings.min_spend_threshold
  );
END;
$$;
