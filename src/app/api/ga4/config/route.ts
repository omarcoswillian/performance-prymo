import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const adAccountId = request.nextUrl.searchParams.get('ad_account_id');
    if (!adAccountId) {
      return NextResponse.json({ error: 'ad_account_id obrigatorio' }, { status: 400 });
    }

    // Verify user owns this account
    const account = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada ou sem permissao' }, { status: 403 });
    }

    const { data } = await supabase
      .from('ga4_configs')
      .select('ga4_property_id')
      .eq('ad_account_id', adAccountId)
      .single();

    return NextResponse.json({
      ga4_property_id: data?.ga4_property_id || null,
    });
  } catch (error) {
    console.error('[GA4 Config GET]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const { ad_account_id, ga4_property_id } = await request.json();

    if (!ad_account_id || !ga4_property_id) {
      return NextResponse.json(
        { error: 'ad_account_id e ga4_property_id sao obrigatorios' },
        { status: 400 }
      );
    }

    // Verify user owns this account
    const account = await verifyAccountOwnership(supabase, user.id, ad_account_id);
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada ou sem permissao' }, { status: 403 });
    }

    const { error } = await supabase
      .from('ga4_configs')
      .upsert(
        {
          ad_account_id,
          ga4_property_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'ad_account_id' }
      );

    if (error) {
      console.error('[GA4 Config POST]', error);
      return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[GA4 Config POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
