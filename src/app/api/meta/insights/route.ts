import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';

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
    const debug = params.get('debug') === 'true';

    if (!adAccountId || !dateStart || !dateEnd) {
      return NextResponse.json(
        { error: 'ad_account_id, date_start, and date_end are required' },
        { status: 400 }
      );
    }

    const ownership = await verifyAccountOwnership(supabase, user.id, adAccountId);
    if (!ownership) {
      return NextResponse.json({ error: 'Conta não pertence ao usuário' }, { status: 403 });
    }

    switch (type) {
      case 'command': {
        // Use SQL RPCs to aggregate in the database, avoiding PostgREST 1000-row limit.
        const [byAdResult, dailyResult] = await Promise.all([
          supabase.rpc('get_insights_by_ad', {
            p_ad_account_id: adAccountId,
            p_date_start: dateStart,
            p_date_end: dateEnd,
          }),
          supabase.rpc('get_insights_daily_totals', {
            p_ad_account_id: adAccountId,
            p_date_start: dateStart,
            p_date_end: dateEnd,
          }),
        ]);

        if (byAdResult.error) {
          console.error('[Insights command] RPC error:', byAdResult.error.message);
          return NextResponse.json({ error: byAdResult.error.message }, { status: 500 });
        }

        const adsData: Array<{
          ad_id: string; impressions: number; clicks: number;
          spend: number; conversions: number; name: string;
          thumbnail_url: string | null; format: string;
          campaign_id: string; adset_id: string; status: string;
        }> = byAdResult.data || [];

        // Get campaign names for enrichment
        const campaignIds = [...new Set(adsData.map(a => a.campaign_id).filter(Boolean))];
        const { data: campaigns } = campaignIds.length > 0
          ? await supabase
              .from('meta_campaigns')
              .select('campaign_id, name')
              .eq('ad_account_id', adAccountId)
              .in('campaign_id', campaignIds)
          : { data: [] };

        const campaignMap = new Map(
          (campaigns || []).map(c => [c.campaign_id, c.name])
        );

        const creatives = adsData.map(ad => {
          const imp = Number(ad.impressions);
          const clk = Number(ad.clicks);
          const spd = Number(ad.spend);
          const conv = Number(ad.conversions);
          return {
            ad_id: ad.ad_id,
            name: ad.name,
            thumbnail_url: ad.thumbnail_url,
            format: ad.format,
            campaign_id: ad.campaign_id,
            campaign_name: ad.campaign_id ? (campaignMap.get(ad.campaign_id) || ad.campaign_id) : '',
            status: ad.status,
            ctr: imp > 0 ? (clk / imp * 100) : 0,
            compras: conv,
            cpa: conv > 0 ? spd / conv : null,
            frequency: 0,
            spend: spd,
            impressions: imp,
            clicks: clk,
            cpc: clk > 0 ? spd / clk : null,
            cpm: imp > 0 ? (spd / imp * 1000) : null,
          };
        });

        const daily_totals: Array<{
          date: string; impressions: number; clicks: number;
          spend: number; conversions: number; cpa: number | null; ctr: number;
        }> = (dailyResult.data || []).map((d: Record<string, unknown>) => ({
          date: d.date as string,
          impressions: Number(d.impressions),
          clicks: Number(d.clicks),
          spend: Number(d.spend),
          conversions: Number(d.conversions),
          cpa: d.cpa != null ? Number(d.cpa) : null,
          ctr: Number(d.ctr || 0),
        }));

        const response: Record<string, unknown> = { creatives, daily_totals };
        if (debug) {
          response._debug = {
            ad_account_id: adAccountId,
            date_start: dateStart,
            date_end: dateEnd,
            total_ads_with_data: adsData.length,
            total_conversions_raw: adsData.reduce((s, a) => s + Number(a.conversions), 0),
            total_spend_raw: adsData.reduce((s, a) => s + Number(a.spend), 0),
            days_with_data: daily_totals.length,
          };
        }
        return NextResponse.json(response);
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
          .order('date', { ascending: true })
          .limit(10000);

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
