import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRole, getClientAccounts } from '@/lib/auth-role';

/**
 * GET /api/meta/accounts
 * Returns the user's connected Meta ad accounts.
 * For admin users: returns accounts they own.
 * For client users: returns accounts they have access to.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(user.id);

    if (role === 'client') {
      // Client: return accounts they have access to
      const clientAccounts = await getClientAccounts(user.id);

      if (clientAccounts.length === 0) {
        return NextResponse.json({ accounts: [] });
      }

      const admin = createAdminClient();
      const adAccountIds = clientAccounts.map(a => a.ad_account_id);

      const { data: accounts } = await admin
        .from('meta_accounts')
        .select('id, ad_account_id, name, status, created_at')
        .in('ad_account_id', adAccountIds);

      // Merge with client labels
      const merged = (accounts || []).map(acc => {
        const clientAcc = clientAccounts.find(c => c.ad_account_id === acc.ad_account_id);
        return {
          ...acc,
          name: clientAcc?.client_label || acc.name,
        };
      });

      return NextResponse.json({ accounts: merged });
    }

    // Admin: return accounts they own
    const { data: accounts, error } = await supabase
      .from('meta_accounts')
      .select('id, ad_account_id, name, status, conversion_event, token_expires_at, credential_type, credential_health, credential_checked_at, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('[Accounts] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
