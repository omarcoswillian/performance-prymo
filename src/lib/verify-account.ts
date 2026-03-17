import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Verifies that the authenticated user has access to the given ad_account_id.
 * Checks both:
 * 1. Direct ownership (admin user owns the account via meta_accounts)
 * 2. Client access (client user was granted access via client_access)
 * Returns the account if valid, null if not found or not authorized.
 */
export async function verifyAccountOwnership(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string
): Promise<{ ad_account_id: string; name: string } | null> {
  // First check direct ownership (admin)
  const { data } = await supabase
    .from('meta_accounts')
    .select('ad_account_id, name')
    .eq('ad_account_id', adAccountId)
    .eq('user_id', userId)
    .single();

  if (data) return data;

  // Then check client access
  const admin = createAdminClient();
  const { data: clientAccess } = await admin
    .from('client_access')
    .select('ad_account_id')
    .eq('client_user_id', userId)
    .eq('ad_account_id', adAccountId)
    .maybeSingle();

  if (clientAccess) {
    // Get account name from meta_accounts (no user_id filter)
    const { data: account } = await admin
      .from('meta_accounts')
      .select('ad_account_id, name')
      .eq('ad_account_id', adAccountId)
      .single();

    return account || { ad_account_id: adAccountId, name: adAccountId };
  }

  return null;
}
