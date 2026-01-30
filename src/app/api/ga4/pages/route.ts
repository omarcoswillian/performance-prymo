import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchGA4PageMetrics,
  getGA4Config,
  persistGA4Data,
  aggregateByPage,
  type GA4PageRow,
} from '@/lib/ga4';
import { verifyAccountOwnership } from '@/lib/verify-account';

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

    // Verify user owns this account
    const account = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!account) {
      return NextResponse.json({ error: 'Conta nao encontrada ou sem permissao' }, { status: 403 });
    }

    // Check GA4 config (includes hostname for client isolation)
    const ga4Config = await getGA4Config(adAccountId);
    if (!ga4Config) {
      return NextResponse.json(
        { error: 'GA4 nao configurado para esta conta.', code: 'GA4_NOT_CONFIGURED' },
        { status: 404 }
      );
    }

    const { propertyId, hostnames: ga4Hostnames } = ga4Config;
    console.log(`[GA4 Pages] account=${adAccountId} hostnames=[${ga4Hostnames.join(', ')}] property=${propertyId}`);

    // Always fetch fresh from GA4 API with hostname filter for accurate isolation.
    // The cache (ga4_page_daily) may not have hostname column yet, so skip it
    // when hostnames are configured and we need isolation.
    const admin = createAdminClient();
    let rows: GA4PageRow[];

    if (ga4Hostnames.length > 0) {
      // Fetch from GA4 API with hostname filter — guarantees data isolation
      rows = await fetchGA4PageMetrics(propertyId, start, end, ga4Hostnames);
      // Persist async (don't block response)
      persistGA4Data(adAccountId, rows).catch((err) =>
        console.error('[GA4] Background persist error:', err)
      );
    } else {
      // No hostnames configured — try cache first, then GA4 API unfiltered
      const { data: cached, error: cacheError } = await admin
        .from('ga4_page_daily')
        .select('*')
        .eq('ad_account_id', adAccountId)
        .gte('date', start)
        .lte('date', end);

      if (!cacheError && cached && cached.length > 0) {
        rows = cached.map((r) => ({
          date: r.date,
          pagePath: r.page_path,
          hostname: r.hostname || '',
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
        console.warn(`[GA4 Pages] No hostnames for account ${adAccountId}. Data may include other clients.`);
        rows = await fetchGA4PageMetrics(propertyId, start, end);
        persistGA4Data(adAccountId, rows).catch((err) =>
          console.error('[GA4] Background persist error:', err)
        );
      }
    }

    // Get Meta clicks and conversions by page for connect rate + sales (optional)
    let metaClicksByPage: Map<string, number> | undefined;
    let metaConversionsByPage: Map<string, number> | undefined;
    const { data: pageMap } = await admin
      .from('meta_creative_page_map')
      .select('ad_id, page_url')
      .eq('ad_account_id', adAccountId);

    if (pageMap && pageMap.length > 0) {
      const adIds = pageMap.map((p) => p.ad_id);
      const { data: insights } = await admin
        .from('meta_ad_insights_daily')
        .select('ad_id, clicks, conversions')
        .eq('ad_account_id', adAccountId)
        .in('ad_id', adIds)
        .gte('date', start)
        .lte('date', end)
        .limit(10000);

      if (insights) {
        const clicksByAd = new Map<string, number>();
        const conversionsByAd = new Map<string, number>();
        for (const row of insights) {
          clicksByAd.set(row.ad_id, (clicksByAd.get(row.ad_id) || 0) + (row.clicks || 0));
          conversionsByAd.set(row.ad_id, (conversionsByAd.get(row.ad_id) || 0) + (row.conversions || 0));
        }

        metaClicksByPage = new Map();
        metaConversionsByPage = new Map();
        for (const pm of pageMap) {
          // Normalize page_url to just pathname for matching with GA4 pagePath
          let normalizedPath = pm.page_url;
          try {
            normalizedPath = new URL(pm.page_url).pathname;
          } catch {
            // Already a path, use as-is
          }

          const clicks = clicksByAd.get(pm.ad_id) || 0;
          const conversions = conversionsByAd.get(pm.ad_id) || 0;
          metaClicksByPage.set(normalizedPath, (metaClicksByPage.get(normalizedPath) || 0) + clicks);
          metaConversionsByPage.set(normalizedPath, (metaConversionsByPage.get(normalizedPath) || 0) + conversions);
        }
      }
    }

    const pages = aggregateByPage(rows, metaClicksByPage);

    // Enrich pages with conversions data
    const enrichedPages = pages.map((p) => {
      const conversions = metaConversionsByPage?.get(p.pagePath) ?? 0;
      const clicks = metaClicksByPage?.get(p.pagePath) ?? 0;
      const taxaConversao = clicks > 0 ? (conversions / clicks) * 100 : 0;
      return { ...p, conversions, clicks, taxaConversao };
    });

    // Also compute aggregate totals for KPIs
    const totalSessions = enrichedPages.reduce((s, p) => s + p.sessions, 0);
    const totalClicks = enrichedPages.reduce((s, p) => s + p.clicks, 0);
    const totalConversions = enrichedPages.reduce((s, p) => s + p.conversions, 0);
    const aggregateConnectRate = totalClicks > 0 ? (totalSessions / totalClicks) * 100 : 0;
    const aggregateTaxaConversao = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    return NextResponse.json({
      pages: enrichedPages,
      kpis: {
        taxaConversao: aggregateTaxaConversao,
        connectRate: aggregateConnectRate,
        totalSessions,
        totalClicks,
        totalConversions,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[GA4 Pages] Error:', msg, error instanceof Error ? error.stack : '');
    return NextResponse.json(
      { error: 'Erro interno ao buscar dados GA4.', detail: msg },
      { status: 500 }
    );
  }
}
