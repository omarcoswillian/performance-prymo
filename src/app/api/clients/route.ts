import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/clients
 * List all client invitations and active clients for the admin user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get invitations created by this admin
    const { data: invitations } = await admin
      .from('client_invitations')
      .select('*')
      .eq('invited_by', user.id)
      .order('created_at', { ascending: false });

    // Get active client access records
    const { data: access } = await admin
      .from('client_access')
      .select('*')
      .eq('invited_by', user.id);

    return NextResponse.json({
      invitations: invitations || [],
      active_clients: access || [],
    });
  } catch (error) {
    console.error('[Clients GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/clients
 * Create a client invitation.
 * Body: { email, ad_account_id, client_label? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { email, ad_account_id, client_label } = body;

    if (!email || !ad_account_id) {
      return NextResponse.json({ error: 'email and ad_account_id required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify the admin owns this account
    const { data: account } = await admin
      .from('meta_accounts')
      .select('ad_account_id, name')
      .eq('ad_account_id', ad_account_id)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 404 });
    }

    // Check if invitation already exists
    const { data: existing } = await admin
      .from('client_invitations')
      .select('id')
      .eq('email', email.toLowerCase())
      .eq('ad_account_id', ad_account_id)
      .eq('invited_by', user.id)
      .is('accepted_at', null)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Convite ja existe para este email e conta' }, { status: 409 });
    }

    // Create invitation
    const { data: invitation, error: insertError } = await admin
      .from('client_invitations')
      .insert({
        email: email.toLowerCase(),
        ad_account_id,
        invited_by: user.id,
        client_label: client_label || account.name,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Clients POST] Insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = `${appUrl}/convite/${invitation.token}`;

    return NextResponse.json({
      invitation,
      invite_url: inviteUrl,
    });
  } catch (error) {
    console.error('[Clients POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/clients
 * Revoke client access or delete invitation.
 * Query: ?type=access&id=xxx OR ?type=invitation&id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const type = params.get('type');
    const id = params.get('id');

    if (!type || !id) {
      return NextResponse.json({ error: 'type and id required' }, { status: 400 });
    }

    const admin = createAdminClient();

    if (type === 'access') {
      await admin
        .from('client_access')
        .delete()
        .eq('id', id)
        .eq('invited_by', user.id);
    } else if (type === 'invitation') {
      await admin
        .from('client_invitations')
        .delete()
        .eq('id', id)
        .eq('invited_by', user.id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Clients DELETE]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
