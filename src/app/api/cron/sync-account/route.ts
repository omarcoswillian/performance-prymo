import { NextRequest, NextResponse } from 'next/server';
import { runFullSync } from '@/lib/meta/sync';
import { checkAlerts } from '@/lib/meta/alerts';
import { syncGA4ForAccount } from '@/lib/ga4';
import { resolveDateRange } from '@/lib/date-utils';

export const maxDuration = 60;

/**
 * POST /api/cron/sync-account
 *
 * Syncs a single account. Called by the main cron dispatcher.
 * Protected by CRON_SECRET.
 *
 * Uses incremental sync: only last 7 days for cron (daily),
 * full 365 days only on manual sync via query param.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ad_account_id, access_token, conversion_event, credential_type, full_sync } = await request.json();

  if (!ad_account_id || !access_token) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  // Incremental: 7 days for daily cron, 365 only when explicitly requested
  const syncDays = full_sync ? 365 : 7;
  const { dateStart, dateEnd } = resolveDateRange(syncDays);

  try {
    await runFullSync(ad_account_id, access_token, conversion_event, dateStart, dateEnd, credential_type || 'user');
    await checkAlerts(ad_account_id);

    // Sync GA4 (D-1)
    try {
      const { dateStart: yesterday } = resolveDateRange('yesterday');
      await syncGA4ForAccount(ad_account_id, yesterday, yesterday);
    } catch (ga4Err) {
      console.warn(`[Cron] GA4 sync skipped for ${ad_account_id}:`, ga4Err);
    }

    return NextResponse.json({ ad_account_id, success: true, days_synced: syncDays });
  } catch (err) {
    console.error(`[Cron] Failed to sync ${ad_account_id}:`, err);
    return NextResponse.json({
      ad_account_id,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
