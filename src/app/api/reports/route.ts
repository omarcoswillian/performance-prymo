import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';

/**
 * GET /api/reports?ad_account_id=xxx
 * Lists all reports for the given ad account, sorted by most recent.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const adAccountId = request.nextUrl.searchParams.get('ad_account_id');
    if (!adAccountId) {
      return NextResponse.json(
        { error: 'ad_account_id é obrigatório.' },
        { status: 400 }
      );
    }

    // Verify user owns this account
    const account = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada ou sem permissao' }, { status: 403 });
    }

    const reportType = request.nextUrl.searchParams.get('report_type');

    let query = supabase
      .from('meta_reports')
      .select('id, ad_account_id, client_name, period_start, period_end, generated_at, report_type, content')
      .eq('ad_account_id', adAccountId)
      .order('generated_at', { ascending: false });

    if (reportType) {
      query = query.eq('report_type', reportType);
    }

    const { data: reports, error } = await query;

    if (error) {
      console.error('[Reports] List error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reports: reports || [] });
  } catch (error) {
    console.error('[Reports] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}

/**
 * DELETE /api/reports?id=xxx&ad_account_id=xxx
 * Deletes a single report by id, verifying ownership.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const reportId = request.nextUrl.searchParams.get('id');
    const adAccountId = request.nextUrl.searchParams.get('ad_account_id');
    if (!reportId) {
      return NextResponse.json(
        { error: 'id do relatório é obrigatório.' },
        { status: 400 }
      );
    }

    // If ad_account_id provided, verify ownership. Otherwise, verify via the report itself.
    if (adAccountId) {
      const account = await verifyAccountOwnership(supabase, user.id, adAccountId);
      if (!account) {
        return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
      }
    } else {
      // Fetch the report first to get its ad_account_id, then verify
      const { data: report } = await supabase
        .from('meta_reports')
        .select('ad_account_id')
        .eq('id', reportId)
        .single();

      if (!report) {
        return NextResponse.json({ error: 'Relatorio nao encontrado' }, { status: 404 });
      }

      const account = await verifyAccountOwnership(supabase, user.id, report.ad_account_id);
      if (!account) {
        return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
      }
    }

    const { error } = await supabase
      .from('meta_reports')
      .delete()
      .eq('id', reportId);

    if (error) {
      console.error('[Reports] Delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Reports] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
