import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt } from '@/lib/crypto';
import { exchangeForLongLivedToken, getAdAccounts } from '@/lib/meta/client';

/**
 * POST /api/meta/auth/callback
 *
 * Receives the short-lived token from Facebook Login SDK,
 * exchanges it for a long-lived token, and stores the ad accounts.
 *
 * Body: { access_token: string, selected_account_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { access_token: shortLivedToken, selected_account_id, renew_all } = body;

    if (!shortLivedToken) {
      return NextResponse.json(
        { error: 'access_token is required' },
        { status: 400 }
      );
    }

    // Exchange for long-lived token
    const { access_token: longLivedToken, expires_in } =
      await exchangeForLongLivedToken(shortLivedToken);

    const tokenExpiresAt = new Date(
      Date.now() + expires_in * 1000
    ).toISOString();
    const encryptedToken = encrypt(longLivedToken);

    // Get available ad accounts
    const adAccounts = await getAdAccounts(longLivedToken);

    // Renew token for ALL existing accounts of this user
    if (renew_all) {
      const adminClient = createAdminClient();
      const { data: existingAccounts } = await adminClient
        .from('meta_accounts')
        .select('ad_account_id')
        .eq('user_id', user.id);

      if (existingAccounts && existingAccounts.length > 0) {
        const { error: updateError } = await adminClient
          .from('meta_accounts')
          .update({
            access_token: encryptedToken,
            token_expires_at: tokenExpiresAt,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('[Auth] Failed to renew tokens:', updateError);
          return NextResponse.json({ error: 'Failed to renew tokens' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          renewed: existingAccounts.length,
          token_expires_at: tokenExpiresAt,
        });
      }
    }

    if (selected_account_id) {
      // Connect a specific account
      const account = adAccounts.find((a) => a.id === selected_account_id);
      if (!account) {
        return NextResponse.json(
          { error: 'Ad account not found or not accessible' },
          { status: 404 }
        );
      }

      const adminClient = createAdminClient();
      const { error: insertError } = await adminClient
        .from('meta_accounts')
        .upsert(
          {
            user_id: user.id,
            ad_account_id: account.id,
            name: account.name,
            access_token: encryptedToken,
            token_expires_at: tokenExpiresAt,
            status: 'active',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,ad_account_id' }
        );

      if (insertError) {
        console.error('[Auth] Failed to save account:', insertError);
        return NextResponse.json(
          { error: 'Failed to save account' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        account: { id: account.id, name: account.name },
      });
    }

    // Return available accounts for selection
    return NextResponse.json({
      accounts: adAccounts.map((a) => ({
        id: a.id,
        name: a.name,
      })),
      token_stored: false,
    });
  } catch (error) {
    console.error('[Auth Callback] Error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
