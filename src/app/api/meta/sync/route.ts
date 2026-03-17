import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runFullSync, runIncrementalSync, runBackfillChunk } from '@/lib/meta/sync';
import { checkAlerts } from '@/lib/meta/alerts';
import { resolveDateRange } from '@/lib/date-utils';

/**
 * POST /api/meta/sync
 *
 * Triggers a manual sync for a specific ad account.
 * Body: {
 *   ad_account_id: string,
 *   mode?: 'incremental' | 'backfill' | 'full'
 *     - incremental (default): re-syncs last 3 days (today/yesterday/day before)
 *     - backfill: runs one backfill chunk (~30 days) progressively
 *     - full: legacy mode, syncs a custom date range
 *   date_start?: string,  // only for mode=full
 *   date_end?: string,    // only for mode=full
 *   reset_backfill?: boolean  // resets backfill cursor to start over
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ad_account_id, mode = 'incremental', reset_backfill } = body;

    if (!ad_account_id) {
      return NextResponse.json(
        { error: 'ad_account_id is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: account, error: accountError } = await supabase
      .from('meta_accounts')
      .select('*')
      .eq('ad_account_id', ad_account_id)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    if (account.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is not active' },
        { status: 400 }
      );
    }

    // Optionally reset backfill cursor
    if (reset_backfill) {
      const adminClient = createAdminClient();
      await adminClient.from('meta_accounts').update({
        backfill_status: 'pending',
        backfill_cursor: null,
        backfill_oldest_date: null,
        backfill_completed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('ad_account_id', ad_account_id);
    }

    if (mode === 'incremental') {
      const result = await runIncrementalSync(
        ad_account_id,
        account.access_token,
        account.conversion_event,
        account.credential_type || 'user'
      );

      const alertsCreated = await checkAlerts(ad_account_id);

      return NextResponse.json({
        success: true,
        mode: 'incremental',
        ...result,
        alerts_created: alertsCreated,
      });
    }

    if (mode === 'backfill') {
      const result = await runBackfillChunk(
        ad_account_id,
        account.access_token,
        account.conversion_event,
        account.credential_type || 'user'
      );

      return NextResponse.json({
        success: true,
        mode: 'backfill',
        ...(result || { status: 'already_complete' }),
      });
    }

    // Legacy full mode: sync a date range
    const range = resolveDateRange(365);
    const dateStart = body.date_start || range.dateStart;
    const dateEnd = body.date_end || range.dateEnd;

    const result = await runFullSync(
      ad_account_id,
      account.access_token,
      account.conversion_event,
      dateStart,
      dateEnd,
      account.credential_type || 'user'
    );

    const alertsCreated = await checkAlerts(ad_account_id);

    return NextResponse.json({
      success: true,
      mode: 'full',
      ...result,
      alerts_created: alertsCreated,
    });
  } catch (error) {
    console.error('[Sync] Error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/meta/sync?ad_account_id=...
 * Returns recent sync logs for an account, including backfill status.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adAccountId = request.nextUrl.searchParams.get('ad_account_id');
    if (!adAccountId) {
      return NextResponse.json(
        { error: 'ad_account_id is required' },
        { status: 400 }
      );
    }

    // Get sync logs
    const { data: logs, error } = await supabase
      .from('meta_sync_log')
      .select('*')
      .eq('ad_account_id', adAccountId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get backfill status
    const { data: account } = await supabase
      .from('meta_accounts')
      .select('backfill_status, backfill_cursor, backfill_oldest_date, backfill_completed_at')
      .eq('ad_account_id', adAccountId)
      .single();

    // Get data coverage (earliest and latest dates in insights)
    const adminClient = createAdminClient();
    const { data: coverage } = await adminClient
      .from('meta_ad_insights_daily')
      .select('date')
      .eq('ad_account_id', adAccountId)
      .order('date', { ascending: true })
      .limit(1)
      .single();

    const { data: latestCoverage } = await adminClient
      .from('meta_ad_insights_daily')
      .select('date')
      .eq('ad_account_id', adAccountId)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const { count: totalRows } = await adminClient
      .from('meta_ad_insights_daily')
      .select('*', { count: 'exact', head: true })
      .eq('ad_account_id', adAccountId);

    return NextResponse.json({
      logs,
      backfill: account ? {
        status: account.backfill_status || 'pending',
        cursor: account.backfill_cursor,
        oldestDate: account.backfill_oldest_date,
        completedAt: account.backfill_completed_at,
      } : null,
      coverage: {
        earliestDate: coverage?.date || null,
        latestDate: latestCoverage?.date || null,
        totalRows: totalRows || 0,
      },
    });
  } catch (error) {
    console.error('[Sync Logs] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
