/**
 * Meta Ads Alert Service
 *
 * Alert rules:
 * 1. "no_conversions": Spend > threshold AND conversions = 0 today
 * 2. "ctr_fatigue": CTR dropped > threshold% vs 7-day average (min 3 days data, min 500 impressions)
 * 3. "high_cpa": CPA exceeds target * multiplier for the day
 * 4. "frequency_fatigue": Frequency exceeds kill threshold
 */

import { createAdminClient } from '@/lib/supabase/admin';

const SPEND_THRESHOLD = 50; // Alert if spend > $50 with 0 conversions
const CTR_DROP_THRESHOLD = 30; // Alert if CTR drops > 30% vs 7d avg
const MIN_IMPRESSIONS_FOR_CTR = 500; // Minimum impressions to avoid noise
const MIN_DAYS_FOR_CTR_AVG = 3; // Minimum days of data for meaningful comparison

export async function checkAlerts(adAccountId: string): Promise<number> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  let alertsCreated = 0;

  // Load account settings for thresholds
  const { data: settings } = await supabase
    .from('meta_settings')
    .select('cpa_target, frequency_kill, cpa_kill_multiplier')
    .eq('ad_account_id', adAccountId)
    .maybeSingle();

  const cpaTarget = settings ? Number(settings.cpa_target) : 50;
  const frequencyKill = settings ? Number(settings.frequency_kill) : 2.8;
  const cpaKillMultiplier = settings ? Number(settings.cpa_kill_multiplier) : 1.3;

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
      if (await alertExistsToday(supabase, adAccountId, ad.ad_id, 'no_conversions', today)) continue;

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

  // Rule 2: CTR fatigue detection
  const { data: todayInsights } = await supabase
    .from('meta_ad_insights_daily')
    .select('ad_id, impressions, clicks')
    .eq('ad_account_id', adAccountId)
    .eq('date', today)
    .gt('impressions', MIN_IMPRESSIONS_FOR_CTR);

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

      if (weekData && weekData.length >= MIN_DAYS_FOR_CTR_AVG) {
        const totalImpressions = weekData.reduce(
          (sum, d) => sum + d.impressions,
          0
        );
        const totalClicks = weekData.reduce((sum, d) => sum + d.clicks, 0);

        // Ensure sufficient historical impressions too
        if (totalImpressions < MIN_IMPRESSIONS_FOR_CTR) continue;

        const avgCtr =
          totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

        if (avgCtr > 0) {
          const dropPct = ((avgCtr - todayCtr) / avgCtr) * 100;

          if (dropPct > CTR_DROP_THRESHOLD) {
            if (await alertExistsToday(supabase, adAccountId, todayAd.ad_id, 'ctr_fatigue', today)) continue;

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

  // Rule 3: High CPA detection
  const { data: highCpaAds } = await supabase
    .from('meta_ad_insights_daily')
    .select('ad_id, spend, conversions')
    .eq('ad_account_id', adAccountId)
    .eq('date', today)
    .gt('spend', 0)
    .gt('conversions', 0);

  if (highCpaAds && highCpaAds.length > 0) {
    const cpaThreshold = cpaTarget * cpaKillMultiplier;
    for (const ad of highCpaAds) {
      const adCpa = ad.spend / ad.conversions;
      if (adCpa > cpaThreshold) {
        if (await alertExistsToday(supabase, adAccountId, ad.ad_id, 'high_cpa', today)) continue;

        await supabase.from('meta_alerts').insert({
          ad_account_id: adAccountId,
          ad_id: ad.ad_id,
          type: 'high_cpa',
          message: `CPA de R$${adCpa.toFixed(2)} hoje, ${((adCpa / cpaTarget) * 100 - 100).toFixed(0)}% acima do alvo (R$${cpaTarget.toFixed(2)}).`,
          severity: adCpa > cpaTarget * 2 ? 'critical' : 'warning',
        });
        alertsCreated++;
      }
    }
  }

  // Rule 4: Frequency fatigue detection
  const { data: highFreqAds } = await supabase
    .from('meta_ad_insights_daily')
    .select('ad_id, frequency, impressions')
    .eq('ad_account_id', adAccountId)
    .eq('date', today)
    .gt('impressions', 100)
    .gt('frequency', frequencyKill);

  if (highFreqAds && highFreqAds.length > 0) {
    for (const ad of highFreqAds) {
      if (await alertExistsToday(supabase, adAccountId, ad.ad_id, 'frequency_fatigue', today)) continue;

      await supabase.from('meta_alerts').insert({
        ad_account_id: adAccountId,
        ad_id: ad.ad_id,
        type: 'frequency_fatigue',
        message: `Frequencia de ${Number(ad.frequency).toFixed(1)} hoje, acima do limite (${frequencyKill}). Audiencia saturada.`,
        severity: Number(ad.frequency) > frequencyKill * 1.5 ? 'critical' : 'warning',
      });
      alertsCreated++;
    }
  }

  return alertsCreated;
}

/** Check if an alert of this type already exists today for this ad */
async function alertExistsToday(
  supabase: ReturnType<typeof createAdminClient>,
  adAccountId: string,
  adId: string,
  alertType: string,
  today: string
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('meta_alerts')
    .select('id')
    .eq('ad_account_id', adAccountId)
    .eq('ad_id', adId)
    .eq('type', alertType)
    .gte('created_at', `${today}T00:00:00`)
    .is('resolved_at', null)
    .limit(1);

  return !!(existing && existing.length > 0);
}
