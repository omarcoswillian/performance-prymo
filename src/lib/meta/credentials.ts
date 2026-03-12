/**
 * Meta Credential Management
 *
 * Centralized library for validating, checking health, and saving
 * Meta API credentials. Supports both User Access Tokens (expire)
 * and System User Access Tokens (permanent).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, decrypt } from '@/lib/crypto';
import { metaApiFetch, MetaApiException } from './client';

export type CredentialType = 'user' | 'system_user';
export type CredentialHealth = 'healthy' | 'degraded' | 'expired' | 'unknown';

const REQUIRED_PERMISSIONS = ['ads_read', 'ads_management', 'business_management'];

interface MeResponse {
  id: string;
  name: string;
}

interface PermissionData {
  permission: string;
  status: string;
}

/**
 * Validate a token by calling GET /me on the Meta Graph API.
 * Returns the user/system user info if valid, throws on failure.
 */
export async function validateTokenWithMeta(
  token: string
): Promise<MeResponse> {
  return metaApiFetch<MeResponse>('me', token, { fields: 'id,name' });
}

/**
 * Check which permissions a token has.
 * Returns list of granted permissions.
 */
export async function checkTokenPermissions(
  token: string
): Promise<string[]> {
  const response = await metaApiFetch<{ data: PermissionData[] }>(
    'me/permissions',
    token
  );
  return (response.data || [])
    .filter((p) => p.status === 'granted')
    .map((p) => p.permission);
}

/**
 * Update credential health status in the database.
 */
export async function updateCredentialHealth(
  adAccountId: string,
  health: CredentialHealth
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('meta_accounts')
    .update({
      credential_health: health,
      credential_checked_at: new Date().toISOString(),
    })
    .eq('ad_account_id', adAccountId);
}

/**
 * Full health check: decrypt token, validate with Meta API, check permissions.
 * Updates the database with the result.
 */
export async function checkCredentialHealth(
  adAccountId: string
): Promise<{ health: CredentialHealth; details: string }> {
  const supabase = createAdminClient();

  const { data: account } = await supabase
    .from('meta_accounts')
    .select('access_token, credential_type')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account?.access_token) {
    await updateCredentialHealth(adAccountId, 'unknown');
    return { health: 'unknown', details: 'No token found' };
  }

  let token: string;
  try {
    token = decrypt(account.access_token);
  } catch {
    await updateCredentialHealth(adAccountId, 'expired');
    return { health: 'expired', details: 'Failed to decrypt token' };
  }

  // Validate token with Meta API
  try {
    await validateTokenWithMeta(token);
  } catch (err) {
    if (err instanceof MetaApiException && err.isTokenExpired) {
      await updateCredentialHealth(adAccountId, 'expired');
      return { health: 'expired', details: 'Token expired or revoked' };
    }
    await updateCredentialHealth(adAccountId, 'expired');
    return {
      health: 'expired',
      details: err instanceof Error ? err.message : 'Token validation failed',
    };
  }

  // Check permissions
  try {
    const granted = await checkTokenPermissions(token);
    const missing = REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));

    if (missing.length > 0) {
      await updateCredentialHealth(adAccountId, 'degraded');
      return {
        health: 'degraded',
        details: `Missing permissions: ${missing.join(', ')}`,
      };
    }
  } catch {
    // Permissions check failed but token itself is valid
    await updateCredentialHealth(adAccountId, 'degraded');
    return { health: 'degraded', details: 'Could not verify permissions' };
  }

  await updateCredentialHealth(adAccountId, 'healthy');
  return { health: 'healthy', details: 'Token valid with all required permissions' };
}

/**
 * Save a System User Access Token for an ad account.
 * Validates the token first, then encrypts and stores it.
 */
export async function saveSystemUserCredential(
  adAccountId: string,
  rawToken: string
): Promise<{ success: boolean; error?: string; name?: string }> {
  // Validate token with Meta API
  let meData: MeResponse;
  try {
    meData = await validateTokenWithMeta(rawToken);
  } catch (err) {
    if (err instanceof MetaApiException && err.isTokenExpired) {
      return { success: false, error: 'Token is invalid or expired' };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Token validation failed',
    };
  }

  // Check permissions
  try {
    const granted = await checkTokenPermissions(rawToken);
    const missing = REQUIRED_PERMISSIONS.filter((p) => !granted.includes(p));
    if (missing.length > 0) {
      return {
        success: false,
        error: `Missing required permissions: ${missing.join(', ')}`,
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to check permissions',
    };
  }

  // Encrypt and save
  const encryptedToken = encrypt(rawToken);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('meta_accounts')
    .update({
      access_token: encryptedToken,
      credential_type: 'system_user' as CredentialType,
      credential_health: 'healthy' as CredentialHealth,
      credential_checked_at: new Date().toISOString(),
      token_expires_at: null, // System user tokens don't expire
      updated_at: new Date().toISOString(),
    })
    .eq('ad_account_id', adAccountId);

  if (error) {
    return { success: false, error: `Database error: ${error.message}` };
  }

  console.log(
    `[Credentials] Saved system_user token for ${adAccountId} (Meta user: ${meData.name})`
  );
  return { success: true, name: meData.name };
}
