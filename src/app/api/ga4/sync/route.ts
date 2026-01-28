import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncGA4ForAccount } from '@/lib/ga4';

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

    const body = await request.json();
    const { ad_account_id, start, end } = body;

    if (!ad_account_id || !start || !end) {
      return NextResponse.json(
        { error: 'ad_account_id, start e end sao obrigatorios.' },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: account } = await supabase
      .from('meta_accounts')
      .select('ad_account_id')
      .eq('ad_account_id', ad_account_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 403 });
    }

    const rowsSynced = await syncGA4ForAccount(ad_account_id, start, end);

    return NextResponse.json({
      success: true,
      rows_synced: rowsSynced,
    });
  } catch (error) {
    console.error('[GA4 Sync] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Erro ao sincronizar dados GA4.' },
      { status: 500 }
    );
  }
}
