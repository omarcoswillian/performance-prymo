import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Verifies that the authenticated user owns the given ad_account_id.
 * Uses the `meta_accounts` table which links user_id to ad_account_id.
 * Returns the account if valid, null if not found or not owned.
 */
export async function verifyAccountOwnership(
  supabase: SupabaseClient,
  userId: string,
  adAccountId: string
): Promise<{ ad_account_id: string; name: string } | null> {
  const { data } = await supabase
    .from('meta_accounts')
    .select('ad_account_id, name')
    .eq('ad_account_id', adAccountId)
    .eq('user_id', userId)
    .single();

  return data || null;
}
