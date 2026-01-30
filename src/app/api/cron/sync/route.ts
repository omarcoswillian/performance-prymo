import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/cron/sync
 *
 * Lightweight dispatcher: fetches all active accounts and fires off
 * individual sync requests to /api/cron/sync-account.
 * Each account runs in its own serverless function invocation,
 * avoiding the 10s timeout on Vercel Hobby.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: accounts, error } = await supabase
    .from('meta_accounts')
    .select('ad_account_id, access_token, conversion_event')
    .eq('status', 'active');

  if (error) {
    console.error('[Cron] Failed to fetch accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'No active accounts', dispatched: 0 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  // Fire-and-forget: dispatch each account sync in parallel
  const dispatches = accounts.map((account) =>
    fetch(`${appUrl}/api/cron/sync-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        ad_account_id: account.ad_account_id,
        access_token: account.access_token,
        conversion_event: account.conversion_event,
      }),
    }).catch((err) => {
      console.error(`[Cron] Failed to dispatch ${account.ad_account_id}:`, err);
      return null;
    })
  );

  // Wait just for the dispatches to be sent (not for completion)
  await Promise.all(dispatches);

  return NextResponse.json({
    dispatched: accounts.length,
    accounts: accounts.map((a) => a.ad_account_id),
  });
}
