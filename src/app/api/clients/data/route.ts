import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  applyDecisions,
  calculateAccountBenchmarkCTR,
  DEFAULT_SETTINGS,
  type CreativeMetrics,
  type CampaignType,
} from '@/lib/decision-engine';

function mapObjectiveToCampaignType(objective: string | null): CampaignType {
  if (!objective) return 'VENDAS';
  const upper = objective.toUpperCase();
  if (upper.includes('LEAD') || upper === 'LEAD_GENERATION' || upper === 'OUTCOME_LEADS') return 'CAPTURA';
  return 'VENDAS';
}

/**
 * GET /api/clients/data?token=xxx&date_start=yyyy-mm-dd&date_end=yyyy-mm-dd
 * Returns dashboard data for the client. Auth via token, not session.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const token = params.get('token');
    const dateStart = params.get('date_start');
    const dateEnd = params.get('date_end');

    if (!token || !dateStart || !dateEnd) {
      return NextResponse.json({ error: 'token, date_start, date_end required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Validate token
    const { data: invitation } = await admin
      .from('client_invitations')
      .select('ad_account_id, client_label, expires_at')
      .eq('token', token)
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Token invalido' }, { status: 401 });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Token expirado' }, { status: 401 });
    }

    const adAccountId = invitation.ad_account_id;

    // Fetch insights (same logic as the main insights API)
    const [byAdResult, dailyResult, settingsResult] = await Promise.all([
      admin.rpc('get_insights_by_ad', {
        p_ad_account_id: adAccountId,
        p_date_start: dateStart,
        p_date_end: dateEnd,
      }),
      admin.rpc('get_insights_daily_totals', {
        p_ad_account_id: adAccountId,
        p_date_start: dateStart,
        p_date_end: dateEnd,
      }),
      admin
        .from('meta_settings')
        .select('cpa_target, min_spend_threshold, frequency_warn, frequency_kill, cpa_kill_multiplier')
        .eq('ad_account_id', adAccountId)
        .maybeSingle(),
    ]);

    if (byAdResult.error) {
      return NextResponse.json({ error: byAdResult.error.message }, { status: 500 });
    }

    const dbSettings = settingsResult.data;
    const effectiveSettings = {
      ...DEFAULT_SETTINGS,
      ...(dbSettings && {
        cpa_target: Number(dbSettings.cpa_target),
        min_spend: Number(dbSettings.min_spend_threshold),
        frequency_warn: Number(dbSettings.frequency_warn),
        frequency_kill: Number(dbSettings.frequency_kill),
        cost_kill_multiplier: Number(dbSettings.cpa_kill_multiplier),
      }),
    };

    const adsData = byAdResult.data || [];

    // Get campaign info
    const campaignIds = [...new Set(adsData.map((a: { campaign_id: string }) => a.campaign_id).filter(Boolean))];
    const { data: campaigns } = campaignIds.length > 0
      ? await admin
          .from('meta_campaigns')
          .select('campaign_id, name, objective')
          .eq('ad_account_id', adAccountId)
          .in('campaign_id', campaignIds)
      : { data: [] };

    const campaignMap = new Map(
      (campaigns || []).map((c: { campaign_id: string; name: string; objective: string }) => [c.campaign_id, { name: c.name, objective: c.objective }])
    );

    const rawCreatives: CreativeMetrics[] = adsData.map((ad: Record<string, unknown>) => {
      const imp = Number(ad.impressions);
      const clk = Number(ad.clicks);
      const spd = Number(ad.spend);
      const conv = Number(ad.conversions);
      const convVal = Number(ad.conversion_value || 0);
      const campInfo = ad.campaign_id ? campaignMap.get(ad.campaign_id as string) : null;
      return {
        ad_id: ad.ad_id,
        name: ad.name,
        thumbnail_url: ad.thumbnail_url,
        format: ad.format,
        primary_text: ad.primary_text ?? null,
        headline: ad.headline ?? null,
        cta: ad.cta ?? null,
        campaign_id: ad.campaign_id,
        campaign_name: campInfo?.name || ad.campaign_id || '',
        campaign_type: mapObjectiveToCampaignType(campInfo?.objective ?? null),
        ctr: imp > 0 ? (clk / imp * 100) : 0,
        compras: conv,
        cpa: conv > 0 ? spd / conv : null,
        conversion_value: convVal,
        roas: spd > 0 && convVal > 0 ? convVal / spd : null,
        reach: Number(ad.reach || 0),
        frequency: ad.avg_frequency != null ? Number(ad.avg_frequency) : null,
        spend: spd,
        impressions: imp,
        clicks: clk,
        cpc: clk > 0 ? spd / clk : null,
        cpm: imp > 0 ? (spd / imp * 1000) : null,
        hook_rate: imp > 0 ? (clk / imp * 100) : null,
      };
    });

    const ctr_benchmark = calculateAccountBenchmarkCTR(rawCreatives);
    const creatives = applyDecisions(rawCreatives, effectiveSettings, {});

    const daily_totals = (dailyResult.data || []).map((d: Record<string, unknown>) => ({
      date: d.date,
      impressions: Number(d.impressions),
      clicks: Number(d.clicks),
      spend: Number(d.spend),
      conversions: Number(d.conversions),
      cpa: d.cpa != null ? Number(d.cpa) : null,
      ctr: Number(d.ctr || 0),
    }));

    return NextResponse.json({
      creatives,
      daily_totals,
      settings: effectiveSettings,
      ctr_benchmark,
      client_label: invitation.client_label,
    });
  } catch (error) {
    console.error('[Client Data]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
