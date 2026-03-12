-- ============================================================
-- Add frequency column to meta_ad_insights_daily
--
-- This column was referenced in migration 008 but was never
-- actually added to the table. The sync code handles its
-- absence gracefully, but adding it enables frequency tracking.
-- ============================================================

ALTER TABLE meta_ad_insights_daily
  ADD COLUMN IF NOT EXISTS frequency numeric(10,4) DEFAULT NULL;

-- Update the get_insights_by_ad RPC to include avg_frequency
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
        'name', COALESCE(a.name, i.ad_id),
        'thumbnail_url', a.thumbnail_url,
        'format', COALESCE(a.format, 'unknown'),
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
      GROUP BY i.ad_id, a.name, a.thumbnail_url, a.format, a.campaign_id, a.adset_id, a.status
      HAVING SUM(i.impressions) > 0
      ORDER BY SUM(i.spend) DESC
    ) sub
  );
END;
$$;
