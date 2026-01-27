import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runFullSync } from '@/lib/meta/sync';
import { checkAlerts } from '@/lib/meta/alerts';
import { format, subDays } from 'date-fns';

/**
 * GET /api/cron/sync
 *
 * Scheduler endpoint: syncs all active accounts.
 * Should be called by an external cron service (Vercel Cron, etc.)
 * Protected by CRON_SECRET header.
 *
 * Syncs the last 7 days + today for each active account.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const dateEnd = format(now, 'yyyy-MM-dd');
  const dateStart = format(subDays(now, 7), 'yyyy-MM-dd');

  // Get all active accounts
  const { data: accounts, error } = await supabase
    .from('meta_accounts')
    .select('ad_account_id, access_token, conversion_event')
    .eq('status', 'active');

  if (error) {
    console.error('[Cron] Failed to fetch accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch accounts' },
      { status: 500 }
    );
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'No active accounts', synced: 0 });
  }

  const results: Array<{
    ad_account_id: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const account of accounts) {
    try {
      await runFullSync(
        account.ad_account_id,
        account.access_token,
        account.conversion_event,
        dateStart,
        dateEnd
      );

      await checkAlerts(account.ad_account_id);

      results.push({
        ad_account_id: account.ad_account_id,
        success: true,
      });
    } catch (err) {
      console.error(
        `[Cron] Failed to sync ${account.ad_account_id}:`,
        err
      );
      results.push({
        ad_account_id: account.ad_account_id,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    synced: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
