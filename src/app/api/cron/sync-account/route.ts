import { NextRequest, NextResponse } from 'next/server';
import { runIncrementalSync, runBackfillChunk } from '@/lib/meta/sync';
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
 * Two-phase sync on every cron run:
 * 1) INCREMENTAL: always re-sync last 3 days (today, yesterday, day before)
 *    to capture attribution corrections and partial-day data.
 * 2) BACKFILL: progressively fetch one chunk (~30 days) of historical data,
 *    working backwards from the cursor. Saves progress to resume next run.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { ad_account_id, access_token, conversion_event, credential_type } = await request.json();

  if (!ad_account_id || !access_token) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const results: Record<string, unknown> = { ad_account_id };

  try {
    // Phase 1: Incremental sync (always runs — last 3 days)
    const incremental = await runIncrementalSync(
      ad_account_id,
      access_token,
      conversion_event,
      credential_type || 'user'
    );
    results.incremental = {
      success: true,
      insights: incremental.insights,
      dateStart: incremental.dateStart,
      dateEnd: incremental.dateEnd,
    };

    // Phase 2: Backfill one historical chunk (if not yet complete)
    try {
      const backfill = await runBackfillChunk(
        ad_account_id,
        access_token,
        conversion_event,
        credential_type || 'user'
      );
      if (backfill) {
        results.backfill = {
          success: true,
          insights: backfill.insights,
          dateStart: backfill.dateStart,
          dateEnd: backfill.dateEnd,
          backfillComplete: backfill.backfillComplete,
          oldestDate: backfill.oldestDate,
        };
      } else {
        results.backfill = { success: true, status: 'already_complete' };
      }
    } catch (backfillErr) {
      console.error(`[Cron] Backfill failed for ${ad_account_id}:`, backfillErr);
      results.backfill = {
        success: false,
        error: backfillErr instanceof Error ? backfillErr.message : 'Unknown error',
      };
      // Don't throw — backfill failure shouldn't block incremental success
    }

    // Check alerts after sync
    await checkAlerts(ad_account_id);

    // Sync GA4 (D-1)
    try {
      const { dateStart: yesterday } = resolveDateRange('yesterday');
      await syncGA4ForAccount(ad_account_id, yesterday, yesterday);
    } catch (ga4Err) {
      console.warn(`[Cron] GA4 sync skipped for ${ad_account_id}:`, ga4Err);
    }

    return NextResponse.json({ ...results, success: true });
  } catch (err) {
    console.error(`[Cron] Failed to sync ${ad_account_id}:`, err);
    return NextResponse.json({
      ...results,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
