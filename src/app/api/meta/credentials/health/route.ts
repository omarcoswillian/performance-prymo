import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkCredentialHealth } from '@/lib/meta/credentials';

/**
 * GET /api/meta/credentials/health?ad_account_id=act_xxx
 * Check and update credential health for an ad account.
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

    // Verify the user owns this account
    const { data: account } = await supabase
      .from('meta_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('ad_account_id', adAccountId)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const result = await checkCredentialHealth(adAccountId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Credentials] Health check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
