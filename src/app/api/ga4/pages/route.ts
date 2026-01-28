import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchGA4PageMetrics,
  getGA4PropertyId,
  persistGA4Data,
  aggregateByPage,
  type GA4PageRow,
} from '@/lib/ga4';

export async function GET(request: NextRequest) {
  try {
    // Auth
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

    // Check GA4 config
    const propertyId = await getGA4PropertyId(adAccountId);
    if (!propertyId) {
      return NextResponse.json(
        { error: 'GA4 nao configurado para esta conta.', code: 'GA4_NOT_CONFIGURED' },
        { status: 404 }
      );
    }

    // Try cache first (ga4_page_daily)
    const admin = createAdminClient();
    const { data: cached, error: cacheError } = await admin
      .from('ga4_page_daily')
      .select('*')
      .eq('ad_account_id', adAccountId)
      .gte('date', start)
      .lte('date', end);

    let rows: GA4PageRow[];

    if (!cacheError && cached && cached.length > 0) {
      // Use cached data
      rows = cached.map((r) => ({
        date: r.date,
        pagePath: r.page_path,
        sessions: r.sessions,
        engagedSessions: r.engaged_sessions,
        engagementRate: parseFloat(r.engagement_rate),
        avgEngagementTime: parseFloat(r.avg_engagement_time),
        conversions: r.conversions,
        eventCount: r.event_count,
        source: r.source || '',
        medium: r.medium || '',
        campaign: r.campaign || '',
      }));
    } else {
      // Fetch from GA4 API and persist
      rows = await fetchGA4PageMetrics(propertyId, start, end);
      // Persist async (don't block response)
      persistGA4Data(adAccountId, rows).catch((err) =>
        console.error('[GA4] Background persist error:', err)
      );
    }

    // Get Meta clicks by page for connect rate (optional)
    let metaClicksByPage: Map<string, number> | undefined;
    const { data: pageMap } = await admin
      .from('meta_creative_page_map')
      .select('ad_id, page_url')
      .eq('ad_account_id', adAccountId);

    if (pageMap && pageMap.length > 0) {
      const adIds = pageMap.map((p) => p.ad_id);
      const { data: insights } = await admin
        .from('meta_ad_insights_daily')
        .select('ad_id, clicks')
        .eq('ad_account_id', adAccountId)
        .in('ad_id', adIds)
        .gte('date', start)
        .lte('date', end);

      if (insights) {
        const clicksByAd = new Map<string, number>();
        for (const row of insights) {
          clicksByAd.set(row.ad_id, (clicksByAd.get(row.ad_id) || 0) + (row.clicks || 0));
        }

        metaClicksByPage = new Map();
        for (const pm of pageMap) {
          const clicks = clicksByAd.get(pm.ad_id) || 0;
          const current = metaClicksByPage.get(pm.page_url) || 0;
          metaClicksByPage.set(pm.page_url, current + clicks);
        }
      }
    }

    const pages = aggregateByPage(rows, metaClicksByPage);

    return NextResponse.json({ pages });
  } catch (error) {
    console.error('[GA4 Pages] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Erro interno ao buscar dados GA4.' },
      { status: 500 }
    );
  }
}
