import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients/token?token=xxx
 * Validates a client token and returns account info.
 * No auth required — the token IS the authentication.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token obrigatorio' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Find the invitation by token
    const { data: invitation } = await admin
      .from('client_invitations')
      .select('*')
      .eq('token', token)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Link invalido ou expirado' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Este link expirou. Peca um novo ao seu gestor.' }, { status: 410 });
    }

    // Get account info
    const { data: account } = await admin
      .from('meta_accounts')
      .select('ad_account_id, name')
      .eq('ad_account_id', invitation.ad_account_id)
      .single();

    return NextResponse.json({
      valid: true,
      ad_account_id: invitation.ad_account_id,
      client_label: invitation.client_label || account?.name || invitation.ad_account_id,
    });
  } catch (error) {
    console.error('[Client Token]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
