/**
 * Notification dispatch service.
 * Sends alerts and summaries via configured channels (Telegram, etc.)
 */

import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendTelegramMessage,
  formatAlertMessage,
  formatDailySummary,
} from './telegram';

interface AlertPayload {
  type: string;
  message: string;
  severity: string;
  ad_id: string;
  ad_account_id: string;
}

interface AccountSummary {
  name: string;
  spend: number;
  conversions: number;
  cpa: number | null;
  alerts: number;
}

/**
 * Send notification for a new alert.
 * Looks up notification preferences for the account owner and dispatches.
 */
export async function sendAlertNotification(alert: AlertPayload): Promise<void> {
  const admin = createAdminClient();

  // Find the user who owns this account
  const { data: account } = await admin
    .from('meta_accounts')
    .select('user_id')
    .eq('ad_account_id', alert.ad_account_id)
    .single();

  if (!account?.user_id) return;

  // Get notification preferences
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', account.user_id)
    .eq('enabled', true);

  if (!prefs || prefs.length === 0) return;

  for (const pref of prefs) {
    // Check severity preference
    if (alert.severity === 'critical' && !pref.notify_critical) continue;
    if (alert.severity === 'warning' && !pref.notify_warnings) continue;

    if (pref.channel === 'telegram') {
      const chatId = pref.config?.chat_id;
      if (!chatId) continue;

      const message = formatAlertMessage(alert);
      await sendTelegramMessage(chatId, message);
    }
  }
}

/**
 * Send daily summary to a user via configured channels.
 */
export async function sendDailySummaryNotification(
  userId: string,
  accountSummaries: AccountSummary[]
): Promise<void> {
  const admin = createAdminClient();

  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('enabled', true)
    .eq('daily_summary', true);

  if (!prefs || prefs.length === 0) return;

  for (const pref of prefs) {
    if (pref.channel === 'telegram') {
      const chatId = pref.config?.chat_id;
      if (!chatId) continue;

      const message = formatDailySummary(accountSummaries);
      await sendTelegramMessage(chatId, message);
    }
  }
}
