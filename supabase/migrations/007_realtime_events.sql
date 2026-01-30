-- ============================================================
-- Real-time tracking: stores page_view / heartbeat events
-- ============================================================

CREATE TABLE IF NOT EXISTS realtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id text NOT NULL,
  session_id text NOT NULL,
  page_path text NOT NULL,
  event_type text NOT NULL DEFAULT 'page_view',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_rt_account_created ON realtime_events (ad_account_id, created_at DESC);
CREATE INDEX idx_rt_account_page ON realtime_events (ad_account_id, page_path, created_at DESC);

-- Allow anonymous inserts from the tracking script (public endpoint uses admin client)
-- No RLS needed since tracking goes through API route with admin client.

-- ============================================================
-- RPC: get_realtime_stats
-- Returns active users, active pages, and top pages for a
-- given account within the last N seconds.
-- ============================================================

CREATE OR REPLACE FUNCTION get_realtime_stats(
  p_ad_account_id TEXT,
  p_window_seconds INT DEFAULT 60
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff timestamptz;
  v_active_users bigint;
  v_active_pages bigint;
  v_top_pages json;
BEGIN
  v_cutoff := now() - (p_window_seconds || ' seconds')::interval;

  SELECT COUNT(DISTINCT session_id)
  INTO v_active_users
  FROM realtime_events
  WHERE ad_account_id = p_ad_account_id
    AND created_at >= v_cutoff;

  SELECT COUNT(DISTINCT page_path)
  INTO v_active_pages
  FROM realtime_events
  WHERE ad_account_id = p_ad_account_id
    AND created_at >= v_cutoff;

  SELECT COALESCE(json_agg(row_data), '[]'::json)
  INTO v_top_pages
  FROM (
    SELECT json_build_object(
      'path', page_path,
      'activeUsers', COUNT(DISTINCT session_id),
      'lastSeen', MAX(created_at)
    ) AS row_data
    FROM realtime_events
    WHERE ad_account_id = p_ad_account_id
      AND created_at >= v_cutoff
    GROUP BY page_path
    ORDER BY COUNT(DISTINCT session_id) DESC, MAX(created_at) DESC
    LIMIT 10
  ) sub;

  RETURN json_build_object(
    'activeUsers', v_active_users,
    'activePages', v_active_pages,
    'topPages', v_top_pages
  );
END;
$$;

-- ============================================================
-- RPC: cleanup_realtime_events
-- Deletes events older than 24 hours. Call via cron or manually.
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_realtime_events()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted bigint;
BEGIN
  DELETE FROM realtime_events
  WHERE created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
