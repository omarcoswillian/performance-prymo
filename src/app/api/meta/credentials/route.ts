import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saveSystemUserCredential } from '@/lib/meta/credentials';

/**
 * POST /api/meta/credentials
 * Save a System User Access Token for an ad account.
 * Validates the token with Meta API before saving.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ad_account_id, system_user_token } = body;

    if (!ad_account_id || !system_user_token) {
      return NextResponse.json(
        { error: 'ad_account_id and system_user_token are required' },
        { status: 400 }
      );
    }

    // Verify the user owns this account
    const { data: account } = await supabase
      .from('meta_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('ad_account_id', ad_account_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const result = await saveSystemUserCredential(ad_account_id, system_user_token);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `System user token saved successfully (Meta user: ${result.name})`,
    });
  } catch (error) {
    console.error('[Credentials] Error saving system user token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
