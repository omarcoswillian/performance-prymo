import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';

/**
 * GET /api/meta/alerts
 * Fetch alerts for an account.
 * Query params: ad_account_id, status (active|resolved|all)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const adAccountId = params.get('ad_account_id');
    const status = params.get('status') || 'active';

    if (!adAccountId) {
      return NextResponse.json({ error: 'ad_account_id required' }, { status: 400 });
    }

    const ownership = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!ownership) {
      return NextResponse.json({ error: 'Conta nao pertence ao usuario' }, { status: 403 });
    }

    let query = supabase
      .from('meta_alerts')
      .select('*')
      .eq('ad_account_id', adAccountId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (status === 'active') {
      query = query.is('resolved_at', null);
    } else if (status === 'resolved') {
      query = query.not('resolved_at', 'is', null);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data || [] });
  } catch (error) {
    console.error('[Alerts GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/meta/alerts
 * Resolve an alert.
 * Body: { id: string, ad_account_id: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, ad_account_id } = body;

    if (!id || !ad_account_id) {
      return NextResponse.json({ error: 'id and ad_account_id required' }, { status: 400 });
    }

    const ownership = await verifyAccountOwnership(supabase, user.id, ad_account_id);
    if (!ownership) {
      return NextResponse.json({ error: 'Conta nao pertence ao usuario' }, { status: 403 });
    }

    const { error } = await supabase
      .from('meta_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('ad_account_id', ad_account_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Alerts PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
