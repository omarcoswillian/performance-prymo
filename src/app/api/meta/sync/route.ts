import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runFullSync } from '@/lib/meta/sync';
import { checkAlerts } from '@/lib/meta/alerts';
import { format, subDays } from 'date-fns';

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

    // Default: last 7 days + today
    const dateEnd = body.date_end || format(new Date(), 'yyyy-MM-dd');
    const dateStart =
      body.date_start || format(subDays(new Date(), 7), 'yyyy-MM-dd');

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
