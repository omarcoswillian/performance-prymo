import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGA4PropertyId } from '@/lib/ga4';

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

    const params = request.nextUrl.searchParams;
    const adAccountId = params.get('ad_account_id');
    const start = params.get('start');
    const end = params.get('end');

    if (!adAccountId || !start || !end) {
      return NextResponse.json(
        { error: 'ad_account_id, start e end sao obrigatorios.' },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: account } = await supabase
      .from('meta_accounts')
      .select('ad_account_id')
      .eq('ad_account_id', adAccountId)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada' }, { status: 403 });
    }

    const propertyId = await getGA4PropertyId(adAccountId);
    if (!propertyId) {
      return NextResponse.json(
        { error: 'GA4 nao configurado.', code: 'GA4_NOT_CONFIGURED' },
        { status: 404 }
      );
    }

    // Aggregate from cached data
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from('ga4_page_daily')
      .select('sessions, engaged_sessions, engagement_rate, avg_engagement_time')
      .eq('ad_account_id', adAccountId)
      .gte('date', start)
      .lte('date', end);

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        summary: {
          totalSessions: 0,
          totalEngagedSessions: 0,
          avgEngagementRate: 0,
          avgEngagementTime: 0,
        },
      });
    }

    const totalSessions = rows.reduce((s, r) => s + (r.sessions || 0), 0);
    const totalEngagedSessions = rows.reduce((s, r) => s + (r.engaged_sessions || 0), 0);
    const avgEngagementRate = totalSessions > 0
      ? rows.reduce((s, r) => s + parseFloat(r.engagement_rate) * (r.sessions || 0), 0) / totalSessions
      : 0;
    const avgEngagementTime = totalSessions > 0
      ? rows.reduce((s, r) => s + parseFloat(r.avg_engagement_time) * (r.sessions || 0), 0) / totalSessions
      : 0;

    return NextResponse.json({
      summary: {
        totalSessions,
        totalEngagedSessions,
        avgEngagementRate,
        avgEngagementTime,
      },
    });
  } catch (error) {
    console.error('[GA4 Summary] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Erro interno ao buscar resumo GA4.' },
      { status: 500 }
    );
  }
}
