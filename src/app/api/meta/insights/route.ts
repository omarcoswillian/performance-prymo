import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAccountOwnership } from '@/lib/verify-account';
import { decrypt } from '@/lib/crypto';
import { metaApiFetch } from '@/lib/meta/client';
import type { CampaignType } from '@/lib/decision-engine';

/**
 * Maps Meta Ads campaign objective to our CampaignType.
 * Default fallback: VENDAS
 */
function mapObjectiveToCampaignType(objective: string | null): CampaignType {
  if (!objective) return 'VENDAS';
  const upper = objective.toUpperCase();
  if (
    upper.includes('LEAD') ||
    upper === 'LEAD_GENERATION' ||
    upper === 'OUTCOME_LEADS'
  ) {
    return 'CAPTURA';
  }
  return 'VENDAS';
}

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
          avg_frequency: number | null;
        }> = byAdResult.data || [];

        // Get campaign names and objectives for enrichment
        const campaignIds = [...new Set(adsData.map(a => a.campaign_id).filter(Boolean))];
        const { data: campaigns } = campaignIds.length > 0
          ? await supabase
              .from('meta_campaigns')
              .select('campaign_id, name, objective')
              .eq('ad_account_id', adAccountId)
              .in('campaign_id', campaignIds)
          : { data: [] };

        const campaignMap = new Map(
          (campaigns || []).map(c => [c.campaign_id, { name: c.name, objective: c.objective }])
        );

        const creatives = adsData.map(ad => {
          const imp = Number(ad.impressions);
          const clk = Number(ad.clicks);
          const spd = Number(ad.spend);
          const conv = Number(ad.conversions);
          const campInfo = ad.campaign_id ? campaignMap.get(ad.campaign_id) : null;
          return {
            ad_id: ad.ad_id,
            name: ad.name,
            thumbnail_url: ad.thumbnail_url,
            format: ad.format,
            campaign_id: ad.campaign_id,
            campaign_name: campInfo?.name || ad.campaign_id || '',
            campaign_type: mapObjectiveToCampaignType(campInfo?.objective ?? null),
            status: ad.status,
            ctr: imp > 0 ? (clk / imp * 100) : 0,
            compras: conv,
            cpa: conv > 0 ? spd / conv : null,
            frequency: ad.avg_frequency != null ? Number(ad.avg_frequency) : null,
            spend: spd,
            impressions: imp,
            clicks: clk,
            cpc: clk > 0 ? spd / clk : null,
            cpm: imp > 0 ? (spd / imp * 1000) : null,
            hook_rate: imp > 0 ? (clk / imp * 100) : null,
          };
        });

        // Repair missing frequency: live-fetch from Meta API if none of the creatives have frequency
        const hasAnyFrequency = creatives.some(c => c.frequency != null && c.frequency > 0);
        if (!hasAnyFrequency && creatives.length > 0) {
          try {
            const liveFreqMap = await fetchLiveFrequencyBulk(adAccountId, dateStart, dateEnd);
            if (liveFreqMap && liveFreqMap.size > 0) {
              for (const c of creatives) {
                const freq = liveFreqMap.get(c.ad_id);
                if (freq != null) {
                  c.frequency = freq;
                }
              }
            }
          } catch (err) {
            console.warn('[Insights] Bulk frequency fetch failed:', err instanceof Error ? err.message : err);
          }
        }

        // Background: repair missing thumbnails by fetching from Meta API
        const missingThumbAds = adsData.filter(a => !a.thumbnail_url);
        if (missingThumbAds.length > 0) {
          // Fire and forget — don't block the response
          repairMissingThumbnails(adAccountId, missingThumbAds.map(a => a.ad_id)).catch(err =>
            console.error('[Insights] Thumbnail repair failed:', err instanceof Error ? err.message : err)
          );
        }

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

        // Check if frequency data is missing (all null) — live-fetch from Meta API
        let enrichedDaily = daily || [];
        const hasFrequency = enrichedDaily.some((d: Record<string, unknown>) => d.frequency != null && Number(d.frequency) > 0);
        if (!hasFrequency && enrichedDaily.length > 0) {
          try {
            const liveFreq = await fetchLiveFrequency(adAccountId, adId, dateStart, dateEnd);
            if (liveFreq) {
              enrichedDaily = enrichedDaily.map((d: Record<string, unknown>) => ({
                ...d,
                frequency: liveFreq.get(d.date as string) ?? d.frequency,
              }));
            }
          } catch (err) {
            console.warn('[Insights] Live frequency fetch failed:', err instanceof Error ? err.message : err);
          }
        }

        // Get campaign/adset names + objective
        let campaignName = '';
        let adsetName = '';
        let campaignType: CampaignType = 'VENDAS';
        if (ad) {
          const { data: camp } = await supabase
            .from('meta_campaigns')
            .select('name, objective')
            .eq('ad_account_id', adAccountId)
            .eq('campaign_id', ad.campaign_id)
            .single();
          campaignName = camp?.name || '';
          campaignType = mapObjectiveToCampaignType(camp?.objective ?? null);

          const { data: adset } = await supabase
            .from('meta_adsets')
            .select('name')
            .eq('ad_account_id', adAccountId)
            .eq('adset_id', ad.adset_id)
            .single();
          adsetName = adset?.name || '';
        }

        return NextResponse.json({
          ad: ad ? { ...ad, campaign_name: campaignName, adset_name: adsetName, campaign_type: campaignType } : null,
          daily: enrichedDaily,
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

/**
 * Fetches frequency data directly from Meta Ads API for a specific ad.
 * Used as fallback when stored data has no frequency values.
 * Returns a Map of date → frequency value.
 */
async function fetchLiveFrequency(
  adAccountId: string,
  adId: string,
  dateStart: string,
  dateEnd: string
): Promise<Map<string, number> | null> {
  const admin = createAdminClient();

  const { data: account } = await admin
    .from('meta_accounts')
    .select('access_token')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account?.access_token) return null;

  const token = decrypt(account.access_token);

  // Fetch insights with frequency at ad level, daily breakdown
  const { metaApiFetchAll } = await import('@/lib/meta/client');
  const insights = await metaApiFetchAll<{
    ad_id: string;
    date_start: string;
    frequency?: string;
    reach?: string;
    impressions?: string;
  }>(
    `${adId}/insights`,
    token,
    {
      time_increment: '1',
      time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
      fields: 'ad_id,frequency,reach,impressions',
    }
  );

  if (!insights || insights.length === 0) return null;

  const map = new Map<string, number>();
  const updateRows: { date: string; frequency: number }[] = [];

  for (const row of insights) {
    let freq: number | null = null;
    if (row.frequency) {
      freq = parseFloat(row.frequency);
    } else if (row.reach && row.impressions) {
      const reach = parseInt(row.reach, 10);
      const imp = parseInt(row.impressions, 10);
      if (reach > 0) freq = imp / reach;
    }
    if (freq != null && freq > 0) {
      map.set(row.date_start, freq);
      updateRows.push({ date: row.date_start, frequency: freq });
    }
  }

  // Persist to DB so we don't have to fetch again
  if (updateRows.length > 0) {
    for (const { date, frequency } of updateRows) {
      await admin
        .from('meta_ad_insights_daily')
        .update({ frequency, updated_at: new Date().toISOString() })
        .eq('ad_account_id', adAccountId)
        .eq('ad_id', adId)
        .eq('date', date);
    }
    console.log(`[Insights] Live-fetched and persisted frequency for ad ${adId}: ${updateRows.length} days`);
  }

  return map;
}

/**
 * Fetches frequency data for all ads in an account for a date range.
 * Used when the command view detects no frequency data.
 */
async function fetchLiveFrequencyBulk(
  adAccountId: string,
  dateStart: string,
  dateEnd: string
): Promise<Map<string, number> | null> {
  const admin = createAdminClient();

  const { data: account } = await admin
    .from('meta_accounts')
    .select('access_token')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account?.access_token) return null;

  const token = decrypt(account.access_token);

  const { metaApiFetchAll } = await import('@/lib/meta/client');
  const insights = await metaApiFetchAll<{
    ad_id: string;
    date_start: string;
    frequency?: string;
    reach?: string;
    impressions?: string;
  }>(
    `${adAccountId}/insights`,
    token,
    {
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
      fields: 'ad_id,frequency,reach,impressions',
    }
  );

  if (!insights || insights.length === 0) return null;

  // Aggregate: ad_id → average frequency across days
  const freqByAd = new Map<string, { sum: number; count: number }>();
  const updateRows: { ad_id: string; date: string; frequency: number }[] = [];

  for (const row of insights) {
    let freq: number | null = null;
    if (row.frequency) {
      freq = parseFloat(row.frequency);
    } else if (row.reach && row.impressions) {
      const reach = parseInt(row.reach, 10);
      const imp = parseInt(row.impressions, 10);
      if (reach > 0) freq = imp / reach;
    }
    if (freq != null && freq > 0) {
      const existing = freqByAd.get(row.ad_id) || { sum: 0, count: 0 };
      existing.sum += freq;
      existing.count += 1;
      freqByAd.set(row.ad_id, existing);
      updateRows.push({ ad_id: row.ad_id, date: row.date_start, frequency: freq });
    }
  }

  // Persist to DB
  if (updateRows.length > 0) {
    for (let i = 0; i < updateRows.length; i += 100) {
      const batch = updateRows.slice(i, i + 100);
      for (const { ad_id, date, frequency } of batch) {
        await admin
          .from('meta_ad_insights_daily')
          .update({ frequency, updated_at: new Date().toISOString() })
          .eq('ad_account_id', adAccountId)
          .eq('ad_id', ad_id)
          .eq('date', date);
      }
    }
    console.log(`[Insights] Bulk live-fetched frequency for ${adAccountId}: ${updateRows.length} rows, ${freqByAd.size} ads`);
  }

  // Return ad_id → average frequency
  const result = new Map<string, number>();
  for (const [adId, { sum, count }] of freqByAd) {
    result.set(adId, sum / count);
  }
  return result;
}

/**
 * Background repair: fetches thumbnail_url from Meta Graph API for ads missing thumbnails.
 * Queries the ad's creative subfield and updates the database.
 */
async function repairMissingThumbnails(adAccountId: string, adIds: string[]) {
  const admin = createAdminClient();

  // Get the access token for this account
  const { data: account } = await admin
    .from('meta_accounts')
    .select('access_token')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account?.access_token) {
    console.warn(`[ThumbnailRepair] No access token for ${adAccountId}`);
    return;
  }

  const token = decrypt(account.access_token);
  let repaired = 0;

  // Get creative_ids for these ads
  const { data: ads } = await admin
    .from('meta_ads')
    .select('ad_id, creative_id')
    .eq('ad_account_id', adAccountId)
    .in('ad_id', adIds)
    .is('thumbnail_url', null);

  if (!ads || ads.length === 0) return;

  for (const ad of ads) {
    try {
      // Try fetching thumbnail from the ad itself (with creative expansion)
      const adData = await metaApiFetch<{
        creative?: { thumbnail_url?: string; image_url?: string };
      }>(
        ad.ad_id,
        token,
        { fields: 'creative{thumbnail_url,image_url}' }
      );

      let url = adData.creative?.thumbnail_url || adData.creative?.image_url || null;

      // Fallback: try creative endpoint directly
      if (!url && ad.creative_id) {
        const creativeData = await metaApiFetch<{ thumbnail_url?: string; image_url?: string }>(
          ad.creative_id,
          token,
          { fields: 'thumbnail_url,image_url' }
        );
        url = creativeData.thumbnail_url || creativeData.image_url || null;
      }

      if (url) {
        await admin
          .from('meta_ads')
          .update({ thumbnail_url: url, updated_at: new Date().toISOString() })
          .eq('ad_account_id', adAccountId)
          .eq('ad_id', ad.ad_id);
        repaired++;
      }
    } catch (err) {
      console.warn(`[ThumbnailRepair] Failed for ad ${ad.ad_id}:`, err instanceof Error ? err.message : err);
    }
  }

  if (repaired > 0) {
    console.log(`[ThumbnailRepair] Repaired ${repaired}/${ads.length} thumbnails for ${adAccountId}`);
  }
}
