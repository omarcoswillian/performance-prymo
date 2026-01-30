-- RPC to aggregate insights by ad_id within a date range.
-- Avoids the PostgREST 1000-row limit by aggregating in SQL.
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
        'status', COALESCE(a.status, 'UNKNOWN')
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

-- RPC to get daily totals (aggregated across all ads).
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
        'cpa', CASE WHEN SUM(i.conversions) > 0
                    THEN (SUM(i.spend) / SUM(i.conversions))::numeric(10,2)
                    ELSE NULL END,
        'ctr', CASE WHEN SUM(i.impressions) > 0
                    THEN (SUM(i.clicks)::numeric / SUM(i.impressions) * 100)::numeric(10,4)
                    ELSE 0 END
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
