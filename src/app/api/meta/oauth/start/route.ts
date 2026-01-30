import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/meta/oauth/start
 *
 * Redirects to Facebook OAuth dialog.
 * Uses server-side redirect flow instead of FB.login SDK,
 * which requires HTTPS on the calling page.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;

  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 });
  }

  const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64url');

  const oauthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  oauthUrl.searchParams.set('client_id', appId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('scope', 'ads_management,ads_read,business_management');
  oauthUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(oauthUrl.toString());
}
