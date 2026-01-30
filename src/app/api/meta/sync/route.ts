import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runFullSync } from '@/lib/meta/sync';
import { checkAlerts } from '@/lib/meta/alerts';
import { resolveDateRange } from '@/lib/date-utils';

/**
 * POST /api/meta/sync
 *
 * Triggers a manual sync for a specific ad account.
 * Body: { ad_account_id: string, date_start?: string, date_end?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ad_account_id } = body;

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

    // Always sync at least 30 days to ensure cumulative consistency (30d >= 14d >= 7d).
    // Uses Brazil timezone to avoid off-by-one from UTC.
    const range30 = resolveDateRange('30');
    const dateStart = range30.dateStart;
    const dateEnd = range30.dateEnd;

    const result = await runFullSync(
      ad_account_id,
      account.access_token,
      account.conversion_event,
      dateStart,
      dateEnd
    );

    // Check alerts after sync
    const alertsCreated = await checkAlerts(ad_account_id);

    return NextResponse.json({
      success: true,
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
 * Returns recent sync logs for an account.
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

    const { data: logs, error } = await supabase
      .from('meta_sync_log')
      .select('*')
      .eq('ad_account_id', adAccountId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('[Sync Logs] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
