import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/clients/accept
 * Accept an invitation and create client access.
 * Called after the client registers/logs in.
 * Body: { token }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Find the invitation
    const { data: invitation } = await admin
      .from('client_invitations')
      .select('*')
      .eq('token', token)
      .is('accepted_at', null)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Convite nao encontrado ou ja aceito' }, { status: 404 });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Convite expirado' }, { status: 410 });
    }

    // Check email matches
    if (invitation.email !== user.email?.toLowerCase()) {
      return NextResponse.json({
        error: `Este convite foi enviado para ${invitation.email}. Faca login com esse email.`,
      }, { status: 403 });
    }

    // Set user role to client
    await admin
      .from('user_roles')
      .upsert({
        user_id: user.id,
        role: 'client',
        display_name: invitation.client_label || user.email,
      }, { onConflict: 'user_id' });

    // Create client access
    await admin
      .from('client_access')
      .upsert({
        client_user_id: user.id,
        ad_account_id: invitation.ad_account_id,
        invited_by: invitation.invited_by,
        client_label: invitation.client_label,
        permissions: { view: true, reports: true },
      }, { onConflict: 'client_user_id,ad_account_id' });

    // Mark invitation as accepted
    await admin
      .from('client_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    return NextResponse.json({
      success: true,
      ad_account_id: invitation.ad_account_id,
      client_label: invitation.client_label,
    });
  } catch (error) {
    console.error('[Clients Accept]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
