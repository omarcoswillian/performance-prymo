/**
 * Meta Ads Alert Service
 *
 * MVP alert rules:
 * 1. "no_conversions": Spend > threshold AND conversions = 0 today
 * 2. "ctr_fatigue": CTR dropped > threshold% vs 7-day average
 */

import { createAdminClient } from '@/lib/supabase/admin';

const SPEND_THRESHOLD = 50; // Alert if spend > $50 with 0 conversions
const CTR_DROP_THRESHOLD = 30; // Alert if CTR drops > 30% vs 7d avg

export async function checkAlerts(adAccountId: string): Promise<number> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  let alertsCreated = 0;

  // Rule 1: Spending without converting
  const { data: noConvAds } = await supabase
    .from('meta_ad_insights_daily')
    .select('ad_id, spend, conversions')
    .eq('ad_account_id', adAccountId)
    .eq('date', today)
    .gt('spend', SPEND_THRESHOLD)
    .eq('conversions', 0);

  if (noConvAds && noConvAds.length > 0) {
    for (const ad of noConvAds) {
      // Check if alert already exists for today
      const { data: existing } = await supabase
        .from('meta_alerts')
        .select('id')
        .eq('ad_account_id', adAccountId)
        .eq('ad_id', ad.ad_id)
        .eq('type', 'no_conversions')
        .gte('created_at', `${today}T00:00:00`)
        .is('resolved_at', null)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from('meta_alerts').insert({
          ad_account_id: adAccountId,
          ad_id: ad.ad_id,
          type: 'no_conversions',
          message: `Ad gastou R$${ad.spend} hoje sem nenhuma conversao.`,
          severity: ad.spend > SPEND_THRESHOLD * 2 ? 'critical' : 'warning',
        });
        alertsCreated++;
      }
    }
  }

  // Rule 2: CTR fatigue detection
  // Get today's insights per ad
  const { data: todayInsights } = await supabase
    .from('meta_ad_insights_daily')
    .select('ad_id, impressions, clicks')
    .eq('ad_account_id', adAccountId)
    .eq('date', today)
    .gt('impressions', 100); // Only check ads with enough impressions

  if (todayInsights && todayInsights.length > 0) {
    for (const todayAd of todayInsights) {
      const todayCtr =
        todayAd.impressions > 0
          ? (todayAd.clicks / todayAd.impressions) * 100
          : 0;

      // Get 7-day average CTR for this ad
      const { data: weekData } = await supabase
        .from('meta_ad_insights_daily')
        .select('impressions, clicks')
        .eq('ad_account_id', adAccountId)
        .eq('ad_id', todayAd.ad_id)
        .gte('date', sevenDaysAgo)
        .lt('date', today);

      if (weekData && weekData.length >= 3) {
        const totalImpressions = weekData.reduce(
          (sum, d) => sum + d.impressions,
          0
        );
        const totalClicks = weekData.reduce((sum, d) => sum + d.clicks, 0);
        const avgCtr =
          totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

        if (avgCtr > 0) {
          const dropPct = ((avgCtr - todayCtr) / avgCtr) * 100;

          if (dropPct > CTR_DROP_THRESHOLD) {
            // Check if alert already exists
            const { data: existing } = await supabase
              .from('meta_alerts')
              .select('id')
              .eq('ad_account_id', adAccountId)
              .eq('ad_id', todayAd.ad_id)
              .eq('type', 'ctr_fatigue')
              .gte('created_at', `${today}T00:00:00`)
              .is('resolved_at', null)
              .limit(1);

            if (!existing || existing.length === 0) {
              await supabase.from('meta_alerts').insert({
                ad_account_id: adAccountId,
                ad_id: todayAd.ad_id,
                type: 'ctr_fatigue',
                message: `CTR caiu ${dropPct.toFixed(1)}% vs media dos ultimos 7 dias (${avgCtr.toFixed(2)}% -> ${todayCtr.toFixed(2)}%). Possivel fadiga do criativo.`,
                severity: dropPct > 50 ? 'critical' : 'warning',
              });
              alertsCreated++;
            }
          }
        }
      }
    }
  }

  return alertsCreated;
}
