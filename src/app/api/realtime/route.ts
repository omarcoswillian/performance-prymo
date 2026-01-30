import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';

/**
 * GET /api/realtime?ad_account_id=XXX&window=60
 *
 * Returns real-time stats: active users, active pages, top pages.
 * Authenticated — requires ownership of the account.
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
      return NextResponse.json({ error: 'ad_account_id required' }, { status: 400 });
    }

    const ownership = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!ownership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const window = parseInt(request.nextUrl.searchParams.get('window') || '60', 10);

    const { data, error } = await supabase.rpc('get_realtime_stats', {
      p_ad_account_id: adAccountId,
      p_window_seconds: Math.min(Math.max(window, 10), 300),
    });

    if (error) {
      console.error('[Realtime stats] RPC error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Realtime] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
