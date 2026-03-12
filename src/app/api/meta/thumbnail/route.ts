import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto';
import { metaApiFetch } from '@/lib/meta/client';

/**
 * GET /api/meta/thumbnail?adAccountId=xxx&adId=yyy
 *
 * Proxy endpoint that returns a fresh Meta thumbnail URL for a given ad.
 * - Checks DB for a cached thumbnail_url first
 * - If missing or expired, fetches a fresh URL from Meta Graph API
 * - Updates DB with the new URL
 * - Returns 302 redirect to the image URL
 *
 * Cached responses: 1 hour (Meta thumbnail URLs expire after ~24h)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const adAccountId = searchParams.get('adAccountId');
  const adId = searchParams.get('adId');

  if (!adAccountId || !adId) {
    return NextResponse.json({ error: 'Missing adAccountId or adId' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check DB first
  const { data: ad } = await admin
    .from('meta_ads')
    .select('thumbnail_url, creative_id')
    .eq('ad_account_id', adAccountId)
    .eq('ad_id', adId)
    .single();

  // If we have a URL, test if it looks valid (not null) and return it
  if (ad?.thumbnail_url) {
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: ad.thumbnail_url,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
      },
    });
  }

  // No cached URL — fetch fresh from Meta API
  const { data: account } = await admin
    .from('meta_accounts')
    .select('access_token')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account?.access_token) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const token = decrypt(account.access_token);
  let thumbnailUrl: string | null = null;

  try {
    // Try fetching from the ad with creative expansion
    const adData = await metaApiFetch<{
      creative?: { thumbnail_url?: string; image_url?: string };
    }>(adId, token, { fields: 'creative{thumbnail_url,image_url}' });
    thumbnailUrl = adData.creative?.thumbnail_url || adData.creative?.image_url || null;
  } catch {
    // Ignore — try creative endpoint
  }

  // Fallback: try creative endpoint directly
  if (!thumbnailUrl && ad?.creative_id) {
    try {
      const creativeData = await metaApiFetch<{ thumbnail_url?: string; image_url?: string }>(
        ad.creative_id,
        token,
        { fields: 'thumbnail_url,image_url' }
      );
      thumbnailUrl = creativeData.thumbnail_url || creativeData.image_url || null;
    } catch {
      // Ignore
    }
  }

  if (!thumbnailUrl) {
    // Return a transparent 1x1 pixel as fallback
    return new NextResponse(null, { status: 204 });
  }

  // Update DB with fresh URL
  await admin
    .from('meta_ads')
    .update({ thumbnail_url: thumbnailUrl, updated_at: new Date().toISOString() })
    .eq('ad_account_id', adAccountId)
    .eq('ad_id', adId);

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: thumbnailUrl,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
    },
  });
}
