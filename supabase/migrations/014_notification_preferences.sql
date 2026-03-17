-- Notification preferences for multi-channel notifications (Telegram, etc.)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'telegram',
  config jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  notify_critical boolean NOT NULL DEFAULT true,
  notify_warnings boolean NOT NULL DEFAULT false,
  daily_summary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel)
);

-- RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification prefs"
  ON notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification prefs"
  ON notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification prefs"
  ON notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification prefs"
  ON notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role full access notification prefs"
  ON notification_preferences FOR ALL
  USING (auth.role() = 'service_role');
