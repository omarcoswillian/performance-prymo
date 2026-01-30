import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt } from '@/lib/crypto';
import { exchangeForLongLivedToken } from '@/lib/meta/client';

const META_API_VERSION = 'v21.0';

/**
 * GET /api/meta/oauth/callback?code=...&state=...
 *
 * Facebook redirects here after user authorizes.
 * Exchanges the code for a short-lived token, then for a long-lived token,
 * and updates all accounts for the user.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const state = params.get('state');
  const errorParam = params.get('error');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const settingsUrl = `${appUrl}/creatives/configuracoes`;

  // User denied permission
  if (errorParam) {
    const msg = encodeURIComponent('Login cancelado pelo usuário.');
    return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
  }

  if (!code || !state) {
    const msg = encodeURIComponent('Parâmetros inválidos no callback.');
    return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
  }

  // Decode state to get userId
  let userId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    userId = decoded.userId;
    if (!userId) throw new Error('No userId');
  } catch {
    const msg = encodeURIComponent('Estado inválido no callback.');
    return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
  }

  const appId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;

  if (!appId || !appSecret) {
    const msg = encodeURIComponent('Configuração do app Meta incompleta.');
    return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
  }

  try {
    // Step 1: Exchange code for short-lived token
    const tokenUrl = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('[OAuth callback] Token exchange error:', tokenData.error);
      const msg = encodeURIComponent(tokenData.error.message || 'Erro ao trocar código por token.');
      return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token (60 days)
    const { access_token: longLivedToken, expires_in } =
      await exchangeForLongLivedToken(shortLivedToken);

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    const encryptedToken = encrypt(longLivedToken);

    // Step 3: Update ALL accounts for this user
    const supabase = createAdminClient();
    const { data: existingAccounts } = await supabase
      .from('meta_accounts')
      .select('ad_account_id')
      .eq('user_id', userId);

    let renewed = 0;
    if (existingAccounts && existingAccounts.length > 0) {
      const { error: updateError } = await supabase
        .from('meta_accounts')
        .update({
          access_token: encryptedToken,
          token_expires_at: tokenExpiresAt,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[OAuth callback] Update error:', updateError);
        const msg = encodeURIComponent('Erro ao salvar token.');
        return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
      }
      renewed = existingAccounts.length;
    }

    const expiryDate = new Date(tokenExpiresAt).toLocaleDateString('pt-BR');
    const msg = encodeURIComponent(`Token renovado para ${renewed} conta(s). Expira em ${expiryDate}.`);
    return NextResponse.redirect(`${settingsUrl}?meta_success=${msg}`);
  } catch (err) {
    console.error('[OAuth callback] Error:', err);
    const msg = encodeURIComponent(err instanceof Error ? err.message : 'Erro interno.');
    return NextResponse.redirect(`${settingsUrl}?meta_error=${msg}`);
  }
}
