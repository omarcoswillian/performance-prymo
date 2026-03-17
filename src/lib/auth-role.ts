/**
 * User role utilities.
 * Determines if the current user is an admin (agency) or client.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export type UserRole = 'admin' | 'client';

/**
 * Get the role of a user. Defaults to 'admin' if no role record exists
 * (backwards compatible — all existing users are admins).
 */
export async function getUserRole(userId: string): Promise<UserRole> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  return (data?.role as UserRole) || 'admin';
}

/**
 * Get all ad_account_ids a client user has access to.
 */
export async function getClientAccounts(clientUserId: string): Promise<
  { ad_account_id: string; client_label: string | null; permissions: Record<string, boolean> }[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_access')
    .select('ad_account_id, client_label, permissions')
    .eq('client_user_id', clientUserId);

  return (data || []).map(row => ({
    ad_account_id: row.ad_account_id,
    client_label: row.client_label,
    permissions: row.permissions as Record<string, boolean>,
  }));
}

/**
 * Check if a client user has access to a specific ad account.
 */
export async function verifyClientAccess(
  clientUserId: string,
  adAccountId: string
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('client_access')
    .select('id')
    .eq('client_user_id', clientUserId)
    .eq('ad_account_id', adAccountId)
    .maybeSingle();

  return !!data;
}
