import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/meta/insights
 *
 * Unified data endpoint for all dashboards.
 * type: "command" | "diagnostic" | "summary" | "daily" | "ads"
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
    const dateStart = params.get('date_start');
    const dateEnd = params.get('date_end');
    const type = params.get('type') || 'command';

    if (!adAccountId || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: 'ad_account_id, date_start, and date_end are required' },
        { status: 400 }
      );
    }

    switch (type) {
      case 'command': {
        // Dash 1: Get all active creatives with aggregated metrics
        const { data: ads, error: adsError } = await supabase
          .from('meta_ads')
          .select('ad_id, name, thumbnail_url, format, campaign_id, adset_id, status')
          .eq('ad_account_id', adAccountId)
          .eq('status', 'ACTIVE');

        if (adsError) {
          console.error('[Insights command] adsError:', adsError.message, adsError.code, adsError.details);
          return NextResponse.json({ error: adsError.message }, { status: 500 });
        }

        if (!ads || ads.length === 0) {
          return NextResponse.json({ creatives: [], ctr_benchmark: 0 });
        }

        // Get insights for each ad
        const adIds = ads.map(a => a.ad_id);
        const { data: insights, error: insError } = await supabase
          .from('meta_ad_insights_daily')
          .select('ad_id, date, impressions, clicks, spend, conversions, cpm, cpc, ctr')
          .eq('ad_account_id', adAccountId)
          .in('ad_id', adIds)
          .gte('date', dateStart)
          .lte('date', dateEnd);

        if (insError) {
          console.error('[Insights command] insError:', insError.message, insError.code, insError.details);
          return NextResponse.json({ error: insError.message }, { status: 500 });
        }

        // Get campaign names
        const campaignIds = [...new Set(ads.map(a => a.campaign_id))];
        const { data: campaigns } = await supabase
          .from('meta_campaigns')
          .select('campaign_id, name')
          .eq('ad_account_id', adAccountId)
          .in('campaign_id', campaignIds);

        const campaignMap = new Map(
          (campaigns || []).map(c => [c.campaign_id, c.name])
        );

        // Aggregate per ad
        const insightsByAd = new Map<string, typeof insights>();
        for (const row of (insights || [])) {
          if (!insightsByAd.has(row.ad_id)) insightsByAd.set(row.ad_id, []);
          insightsByAd.get(row.ad_id)!.push(row);
        }

        const creatives = ads
          .map(ad => {
            const rows = insightsByAd.get(ad.ad_id) || [];
            const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
            const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
            const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
            const totalConversions = rows.reduce((s, r) => s + (r.conversions || 0), 0);
            // frequency column may not exist yet (migration 002 pending)
            const avgFrequency = rows.length > 0
              ? rows.reduce((s, r) => s + Number((r as Record<string, unknown>).frequency || 0), 0) / rows.length
              : 0;

            return {
              ad_id: ad.ad_id,
              name: ad.name,
              thumbnail_url: ad.thumbnail_url,
              format: ad.format,
              campaign_id: ad.campaign_id,
              campaign_name: campaignMap.get(ad.campaign_id) || ad.campaign_id,
              ctr: totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0,
              compras: totalConversions,
              cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
              frequency: avgFrequency,
              spend: totalSpend,
              impressions: totalImpressions,
              clicks: totalClicks,
              cpc: totalClicks > 0 ? totalSpend / totalClicks : null,
              cpm: totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : null,
            };
          })
          .filter(c => c.impressions > 0)
          .sort((a, b) => b.spend - a.spend);

        // Daily totals for trend charts
        const dailyMap = new Map<string, { impressions: number; clicks: number; spend: number; conversions: number }>();
        for (const row of (insights || [])) {
          const d = row.date;
          if (!d) continue;
          const existing = dailyMap.get(d) || { impressions: 0, clicks: 0, spend: 0, conversions: 0 };
          existing.impressions += row.impressions || 0;
          existing.clicks += row.clicks || 0;
          existing.spend += Number(row.spend || 0);
          existing.conversions += row.conversions || 0;
          dailyMap.set(d, existing);
        }
        const daily_totals = Array.from(dailyMap.entries())
          .map(([date, m]) => ({
            date,
            impressions: m.impressions,
            clicks: m.clicks,
            spend: m.spend,
            conversions: m.conversions,
            cpa: m.conversions > 0 ? m.spend / m.conversions : null,
            ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({ creatives, daily_totals });
      }

      case 'diagnostic': {
        const adId = params.get('ad_id');
        if (!adId) {
          return NextResponse.json({ error: 'ad_id required' }, { status: 400 });
        }

        // Get ad details
        const { data: ad } = await supabase
          .from('meta_ads')
          .select('*')
          .eq('ad_account_id', adAccountId)
          .eq('ad_id', adId)
          .single();

        // Get daily data for this ad
        const { data: daily } = await supabase
          .from('meta_ad_insights_daily')
          .select('*')
          .eq('ad_account_id', adAccountId)
          .eq('ad_id', adId)
          .gte('date', dateStart)
          .lte('date', dateEnd)
          .order('date', { ascending: true });

        // Get campaign/adset names
        let campaignName = '';
        let adsetName = '';
        if (ad) {
          const { data: camp } = await supabase
            .from('meta_campaigns')
            .select('name')
            .eq('ad_account_id', adAccountId)
            .eq('campaign_id', ad.campaign_id)
            .single();
          campaignName = camp?.name || '';

          const { data: adset } = await supabase
            .from('meta_adsets')
            .select('name')
            .eq('ad_account_id', adAccountId)
            .eq('adset_id', ad.adset_id)
            .single();
          adsetName = adset?.name || '';
        }

        return NextResponse.json({
          ad: ad ? { ...ad, campaign_name: campaignName, adset_name: adsetName } : null,
          daily: daily || [],
        });
      }

      case 'summary': {
        const { data, error } = await supabase.rpc(
          'get_account_metrics_summary',
          { p_ad_account_id: adAccountId, p_date_start: dateStart, p_date_end: dateEnd }
        );
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
      }

      case 'daily': {
        const { data, error } = await supabase.rpc('get_daily_series', {
          p_ad_account_id: adAccountId, p_date_start: dateStart, p_date_end: dateEnd,
          p_ad_id: params.get('ad_id') || null,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data || []);
      }

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Insights] Error:', error instanceof Error ? error.message : error, error instanceof Error ? error.stack : '');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
