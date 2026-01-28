-- ============================================================
-- Reports table - AI-generated and weekly reports
-- ============================================================

CREATE TABLE IF NOT EXISTS meta_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_type TEXT NOT NULL DEFAULT 'ai'
    CHECK (report_type IN ('ai', 'weekly')),
  content TEXT NOT NULL,
  context_json JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE meta_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reports of own accounts"
  ON meta_reports FOR SELECT
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE POLICY "Users can manage reports of own accounts"
  ON meta_reports FOR ALL
  USING (ad_account_id IN (SELECT get_user_ad_account_ids()));

CREATE INDEX idx_meta_reports_account_date
  ON meta_reports (ad_account_id, generated_at DESC);
