/**
 * Meta Ads Sync Service
 *
 * Handles syncing campaigns, adsets, ads (structure) and daily insights
 * from Meta Marketing API to Supabase.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt } from '@/lib/crypto';
import { metaApiFetchAll, metaApiFetch, MetaApiException } from './client';

// ============================================================
// Types for Meta API responses
// ============================================================

interface MetaCampaignResponse {
  id: string;
  name: string;
  objective?: string;
  status: string;
}

interface MetaAdsetResponse {
  id: string;
  campaign_id: string;
  name: string;
  optimization_goal?: string;
  billing_event?: string;
  status: string;
}

interface MetaAdResponse {
  id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  status: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    image_url?: string;
    effective_object_story_id?: string;
    body?: string;
    title?: string;
    call_to_action_type?: string;
    object_type?: string;
  };
  preview_shareable_link?: string;
}

interface MetaInsightResponse {
  ad_id: string;
  date_start: string;
  date_stop: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  actions?: Array<{
    action_type: string;
    value: string;
  }>;
  action_values?: Array<{
    action_type: string;
    value: string;
  }>;
}

// ============================================================
// Sync Structure
// ============================================================

export async function syncMetaStructure(
  adAccountId: string,
  accessToken: string
): Promise<{ campaigns: number; adsets: number; ads: number }> {
  const supabase = createAdminClient();
  const decryptedToken = decrypt(accessToken);

  // Sync campaigns
  const campaigns = await metaApiFetchAll<MetaCampaignResponse>(
    `${adAccountId}/campaigns`,
    decryptedToken,
    { fields: 'id,name,objective,status' }
  );

  if (campaigns.length > 0) {
    const campaignRows = campaigns.map((c) => ({
      ad_account_id: adAccountId,
      campaign_id: c.id,
      name: c.name,
      objective: c.objective ?? null,
      status: c.status,
      updated_at: new Date().toISOString(),
    }));

    const { error: campError } = await supabase
      .from('meta_campaigns')
      .upsert(campaignRows, { onConflict: 'ad_account_id,campaign_id' });

    if (campError) throw new Error(`Failed to upsert campaigns: ${campError.message}`);
  }

  // Sync adsets
  const adsets = await metaApiFetchAll<MetaAdsetResponse>(
    `${adAccountId}/adsets`,
    decryptedToken,
    { fields: 'id,campaign_id,name,optimization_goal,billing_event,status' }
  );

  if (adsets.length > 0) {
    const adsetRows = adsets.map((a) => ({
      ad_account_id: adAccountId,
      adset_id: a.id,
      campaign_id: a.campaign_id,
      name: a.name,
      optimization_goal: a.optimization_goal ?? null,
      billing_event: a.billing_event ?? null,
      status: a.status,
      updated_at: new Date().toISOString(),
    }));

    const { error: adsetError } = await supabase
      .from('meta_adsets')
      .upsert(adsetRows, { onConflict: 'ad_account_id,adset_id' });

    if (adsetError) throw new Error(`Failed to upsert adsets: ${adsetError.message}`);
  }

  // Sync ads with creative details
  const ads = await metaApiFetchAll<MetaAdResponse>(
    `${adAccountId}/ads`,
    decryptedToken,
    {
      fields:
        'id,adset_id,campaign_id,name,status,creative{id,thumbnail_url,image_url,body,title,call_to_action_type,object_type},preview_shareable_link',
    }
  );

  if (ads.length > 0) {
    const adRows = ads.map((ad) => ({
      ad_account_id: adAccountId,
      ad_id: ad.id,
      adset_id: ad.adset_id,
      campaign_id: ad.campaign_id,
      name: ad.name,
      status: ad.status,
      creative_id: ad.creative?.id ?? null,
      preview_url: ad.preview_shareable_link ?? null,
      thumbnail_url: ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null,
      format: detectFormat(ad.creative?.object_type),
      primary_text: ad.creative?.body ?? null,
      headline: ad.creative?.title ?? null,
      cta: ad.creative?.call_to_action_type ?? null,
      updated_at: new Date().toISOString(),
    }));

    // Batch upsert in chunks of 100 to avoid payload limits
    for (let i = 0; i < adRows.length; i += 100) {
      const chunk = adRows.slice(i, i + 100);
      const { error: adError } = await supabase
        .from('meta_ads')
        .upsert(chunk, { onConflict: 'ad_account_id,ad_id' });

      if (adError) throw new Error(`Failed to upsert ads (batch ${i}): ${adError.message}`);
    }
  }

  return {
    campaigns: campaigns.length,
    adsets: adsets.length,
    ads: ads.length,
  };
}

function detectFormat(objectType?: string): string {
  if (!objectType) return 'unknown';
  const lower = objectType.toLowerCase();
  if (lower.includes('video')) return 'video';
  if (lower.includes('photo') || lower.includes('image') || lower.includes('link')) return 'image';
  if (lower.includes('carousel') || lower.includes('multi')) return 'carousel';
  return 'unknown';
}

// ============================================================
// Sync Insights Daily
// ============================================================

/**
 * Syncs daily insights at the AD level.
 * Uses time_increment=1 to get daily breakdowns.
 *
 * @param adAccountId - The ad account ID (act_...)
 * @param accessToken - The encrypted access token
 * @param dateStart - Start date (YYYY-MM-DD)
 * @param dateEnd - End date (YYYY-MM-DD)
 * @param conversionEvent - The action_type to count as a conversion
 */
export async function syncMetaInsightsDaily(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateEnd: string,
  conversionEvent: string = 'offsite_conversion.fb_pixel_purchase'
): Promise<number> {
  const supabase = createAdminClient();
  const decryptedToken = decrypt(accessToken);

  // Meta API: insights at AD level with daily breakdown
  const insights = await metaApiFetchAll<MetaInsightResponse>(
    `${adAccountId}/insights`,
    decryptedToken,
    {
      level: 'ad',
      time_increment: '1',
      time_range: JSON.stringify({
        since: dateStart,
        until: dateEnd,
      }),
      fields:
        'ad_id,impressions,clicks,spend,cpm,cpc,ctr,actions,action_values',
    }
  );

  if (insights.length === 0) return 0;

  const rows = insights.map((row) => {
    const conversions = extractConversions(row.actions, conversionEvent);
    const conversionValue = extractConversionValue(row.action_values, conversionEvent);

    return {
      ad_account_id: adAccountId,
      ad_id: row.ad_id,
      date: row.date_start, // With time_increment=1, date_start = date_stop = single day
      impressions: parseInt(row.impressions || '0', 10),
      clicks: parseInt(row.clicks || '0', 10),
      spend: parseFloat(row.spend || '0'),
      conversions,
      conversion_value: conversionValue,
      cpm: row.cpm ? parseFloat(row.cpm) : null,
      cpc: row.cpc ? parseFloat(row.cpc) : null,
      ctr: row.ctr ? parseFloat(row.ctr) : null,
      updated_at: new Date().toISOString(),
    };
  });

  // Batch upsert
  let totalSynced = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from('meta_ad_insights_daily')
      .upsert(chunk, { onConflict: 'ad_account_id,ad_id,date' });

    if (error) throw new Error(`Failed to upsert insights (batch ${i}): ${error.message}`);
    totalSynced += chunk.length;
  }

  return totalSynced;
}

/**
 * Extracts conversion count from Meta's actions array.
 *
 * Conversion mapping strategy:
 * - The `conversionEvent` parameter defines which action_type counts as a conversion.
 * - Common values:
 *   - "offsite_conversion.fb_pixel_purchase" → E-commerce purchase
 *   - "offsite_conversion.fb_pixel_lead" → Lead generation
 *   - "lead" → On-Facebook lead ads
 *   - "offsite_conversion.fb_pixel_complete_registration" → Registration
 *   - "offsite_conversion.fb_pixel_add_to_cart" → Add to cart
 * - If no exact match, also tries partial matching on the event name.
 * - This is configurable per account via meta_accounts.conversion_event.
 */
function extractConversions(
  actions: Array<{ action_type: string; value: string }> | undefined,
  conversionEvent: string
): number {
  if (!actions || actions.length === 0) return 0;

  // Try exact match first
  const exact = actions.find((a) => a.action_type === conversionEvent);
  if (exact) return parseInt(exact.value, 10);

  // Try partial match (e.g., "purchase" matches "offsite_conversion.fb_pixel_purchase")
  const eventName = conversionEvent.split('.').pop() || conversionEvent;
  const partial = actions.find((a) => a.action_type.includes(eventName));
  if (partial) return parseInt(partial.value, 10);

  return 0;
}

function extractConversionValue(
  actionValues: Array<{ action_type: string; value: string }> | undefined,
  conversionEvent: string
): number {
  if (!actionValues || actionValues.length === 0) return 0;

  const exact = actionValues.find((a) => a.action_type === conversionEvent);
  if (exact) return parseFloat(exact.value);

  const eventName = conversionEvent.split('.').pop() || conversionEvent;
  const partial = actionValues.find((a) => a.action_type.includes(eventName));
  if (partial) return parseFloat(partial.value);

  return 0;
}

// ============================================================
// Full Sync Orchestrator
// ============================================================

export async function runFullSync(
  adAccountId: string,
  accessToken: string,
  conversionEvent: string,
  dateStart: string,
  dateEnd: string
): Promise<{
  structure: { campaigns: number; adsets: number; ads: number };
  insights: number;
}> {
  const supabase = createAdminClient();

  // Create sync log entry
  const { data: syncLog, error: logError } = await supabase
    .from('meta_sync_log')
    .insert({
      ad_account_id: adAccountId,
      sync_type: 'full',
      status: 'running',
    })
    .select('id')
    .single();

  if (logError) {
    console.error('[Sync] Failed to create sync log:', logError);
  }

  try {
    const structure = await syncMetaStructure(adAccountId, accessToken);
    const insights = await syncMetaInsightsDaily(
      adAccountId,
      accessToken,
      dateStart,
      dateEnd,
      conversionEvent
    );

    // Update sync log
    if (syncLog) {
      await supabase
        .from('meta_sync_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          records_synced:
            structure.campaigns + structure.adsets + structure.ads + insights,
        })
        .eq('id', syncLog.id);
    }

    return { structure, insights };
  } catch (error) {
    // Update sync log with error
    if (syncLog) {
      await supabase
        .from('meta_sync_log')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('id', syncLog.id);
    }

    throw error;
  }
}
