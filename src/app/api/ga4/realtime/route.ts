import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGA4Config, fetchGA4Realtime } from '@/lib/ga4';
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
      return NextResponse.json(
        { error: 'ad_account_id e obrigatorio.' },
        { status: 400 }
      );
    }

    const account = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada ou sem permissao' }, { status: 403 });
    }

    const ga4Config = await getGA4Config(adAccountId);
    if (!ga4Config) {
      return NextResponse.json(
        { error: 'GA4 nao configurado.', code: 'GA4_NOT_CONFIGURED' },
        { status: 404 }
      );
    }

    const data = await fetchGA4Realtime(ga4Config.propertyId, ga4Config.hostnames);
    return NextResponse.json(data);
  } catch (error) {
    // Realtime API may not be available for all properties — return empty data instead of 500
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('INVALID_ARGUMENT') || msg.includes('PERMISSION_DENIED') || msg.includes('NOT_FOUND')) {
      return NextResponse.json({ activeUsers: 0, activePages: 0, topPages: [], unavailable: true });
    }
    console.error('[GA4 Realtime] Error:', msg);
    return NextResponse.json(
      { error: 'Erro interno ao buscar dados em tempo real.' },
      { status: 500 }
    );
  }
}
