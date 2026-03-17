/**
 * Meta Ads Sync Service
 *
 * Handles syncing campaigns, adsets, ads (structure) and daily insights
 * from Meta Marketing API to Supabase.
 *
 * Two sync modes:
 * - INCREMENTAL: Re-syncs the last INCREMENTAL_DAYS (today, yesterday, day before)
 *   to capture attribution corrections and partial-day data. Runs on every cron.
 * - BACKFILL: Progressively fetches full historical data from account creation,
 *   working backwards in monthly chunks. Saves cursor to resume across runs.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { decrypt, encrypt } from '@/lib/crypto';
import { metaApiFetchAll, metaApiFetch, MetaApiException, refreshLongLivedToken } from './client';
import { updateCredentialHealth, type CredentialType } from './credentials';
import { format, subDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const TIMEZONE = 'America/Sao_Paulo';

/** Days to always re-sync on incremental (today + yesterday + day before) */
const INCREMENTAL_DAYS = 3;

/** Days per chunk during backfill (monthly chunks) */
const BACKFILL_CHUNK_DAYS = 30;

/** Format a Date to YYYY-MM-DD */
function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

// ============================================================
// Types for Meta API responses
// ============================================================

interface MetaCampaignResponse {
  id: string;
  name: string;
  objective?: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
}

interface MetaAdsetResponse {
  id: string;
  campaign_id: string;
  name: string;
  optimization_goal?: string;
  billing_event?: string;
  status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  bid_amount?: string;
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
    object_url?: string;
    link_url?: string;
    object_story_spec?: {
      link_data?: { link?: string };
      video_data?: { call_to_action?: { value?: { link?: string } } };
    };
  };
  preview_shareable_link?: string;
}

interface MetaPlacementInsightResponse {
  ad_id: string;
  date_start: string;
  publisher_platform?: string;
  platform_position?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  conversions?: number;
  reach?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
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
  frequency?: string;
  reach?: string;
  video_play_actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{ action_type: string; value: string }>;
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

  // Sync campaigns (with budget and bid strategy)
  const campaigns = await metaApiFetchAll<MetaCampaignResponse>(
    `${adAccountId}/campaigns`,
    decryptedToken,
    { fields: 'id,name,objective,status,daily_budget,lifetime_budget,bid_strategy' }
  );

  if (campaigns.length > 0) {
    const campaignRows = campaigns.map((c) => ({
      ad_account_id: adAccountId,
      campaign_id: c.id,
      name: c.name,
      objective: c.objective ?? null,
      status: c.status,
      daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
      lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
      bid_strategy: c.bid_strategy ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error: campError } = await supabase
      .from('meta_campaigns')
      .upsert(campaignRows, { onConflict: 'ad_account_id,campaign_id' });

    if (campError) throw new Error(`Failed to upsert campaigns: ${campError.message}`);
  }

  // Mark stale campaigns (not returned by API) as DELETED
  if (campaigns.length > 0) {
    const activeCampaignIds = campaigns.map(c => c.id);
    await supabase
      .from('meta_campaigns')
      .update({ status: 'DELETED', updated_at: new Date().toISOString() })
      .eq('ad_account_id', adAccountId)
      .not('campaign_id', 'in', `(${activeCampaignIds.join(',')})`);
  }

  // Sync adsets (with budget and bid fields)
  const adsets = await metaApiFetchAll<MetaAdsetResponse>(
    `${adAccountId}/adsets`,
    decryptedToken,
    { fields: 'id,campaign_id,name,optimization_goal,billing_event,status,daily_budget,lifetime_budget,bid_strategy,bid_amount' }
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
      daily_budget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
      lifetime_budget: a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : null,
      bid_strategy: a.bid_strategy ?? null,
      bid_amount: a.bid_amount ? parseFloat(a.bid_amount) / 100 : null,
      updated_at: new Date().toISOString(),
    }));

    const { error: adsetError } = await supabase
      .from('meta_adsets')
      .upsert(adsetRows, { onConflict: 'ad_account_id,adset_id' });

    if (adsetError) throw new Error(`Failed to upsert adsets: ${adsetError.message}`);
  }

  // Mark stale adsets
  if (adsets.length > 0) {
    const activeAdsetIds = adsets.map(a => a.id);
    await supabase
      .from('meta_adsets')
      .update({ status: 'DELETED', updated_at: new Date().toISOString() })
      .eq('ad_account_id', adAccountId)
      .not('adset_id', 'in', `(${activeAdsetIds.join(',')})`);
  }

  // Sync ads with creative details — include DISAPPROVED for compliance tracking
  const AD_STATUS_FILTER = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'DISAPPROVED'];
  const FULL_AD_FIELDS =
    'id,adset_id,campaign_id,name,status,creative{id,thumbnail_url,image_url,body,title,call_to_action_type,object_type,object_url,link_url,object_story_spec},preview_shareable_link';
  const LIGHT_AD_FIELDS =
    'id,adset_id,campaign_id,name,status,creative{id,thumbnail_url,image_url,body,title,call_to_action_type,object_type,object_url,link_url},preview_shareable_link';

  let ads: MetaAdResponse[];
  try {
    ads = await metaApiFetchAll<MetaAdResponse>(
      `${adAccountId}/ads`,
      decryptedToken,
      { fields: FULL_AD_FIELDS, filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: AD_STATUS_FILTER }]) }
    );
  } catch (err) {
    // Fallback: lighter fields without object_story_spec and no status filter
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('reduce the amount') || msg.includes('reduza a quantidade')) {
      console.warn(`[Sync] Ads request too large for ${adAccountId}, retrying with lighter fields`);
      try {
        ads = await metaApiFetchAll<MetaAdResponse>(
          `${adAccountId}/ads`,
          decryptedToken,
          { fields: LIGHT_AD_FIELDS, filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: AD_STATUS_FILTER }]) }
        );
      } catch {
        console.warn(`[Sync] Ads request still too large for ${adAccountId}, fetching minimal fields`);
        ads = await metaApiFetchAll<MetaAdResponse>(
          `${adAccountId}/ads`,
          decryptedToken,
          { fields: 'id,adset_id,campaign_id,name,status', filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]) }
        );
      }
    } else {
      throw err;
    }
  }

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

    // Second pass: fetch thumbnails for ads that ended up without one
    // Process ALL missing thumbnails in batches, with failure tolerance
    const missingThumbnails = adRows.filter((r) => !r.thumbnail_url && r.creative_id);
    if (missingThumbnails.length > 0) {
      console.log(`[Sync] ${missingThumbnails.length} ads missing thumbnails, fetching...`);
      let consecutiveFailures = 0;
      const thumbnailUpdates: Array<{ ad_id: string; thumbnail_url: string }> = [];

      for (const row of missingThumbnails) {
        if (consecutiveFailures >= 3) {
          console.warn(`[Sync] Stopping thumbnail fetch after 3 consecutive failures`);
          break;
        }
        try {
          const creativeData = await metaApiFetch<{ thumbnail_url?: string; image_url?: string }>(
            `${row.creative_id}`,
            decryptedToken,
            { fields: 'thumbnail_url,image_url' }
          );
          const url = creativeData.thumbnail_url || creativeData.image_url || null;
          if (url) {
            thumbnailUpdates.push({ ad_id: row.ad_id, thumbnail_url: url });
          }
          consecutiveFailures = 0;
        } catch (err) {
          consecutiveFailures++;
          console.warn(`[Sync] Failed to fetch thumbnail for creative ${row.creative_id}:`, err instanceof Error ? err.message : err);
        }
      }

      // Batch update thumbnails
      if (thumbnailUpdates.length > 0) {
        for (const { ad_id, thumbnail_url } of thumbnailUpdates) {
          await supabase
            .from('meta_ads')
            .update({ thumbnail_url, updated_at: new Date().toISOString() })
            .eq('ad_account_id', adAccountId)
            .eq('ad_id', ad_id);
        }
        console.log(`[Sync] Updated ${thumbnailUpdates.length} thumbnails`);
      }
    }
  }

  // Sync creative → page mapping (extract landing page URLs from ad creatives)
  const pageMapRows: { ad_account_id: string; ad_id: string; page_url: string }[] = [];
  for (const ad of ads) {
    const url = extractLandingPageUrl(ad);
    if (url) {
      pageMapRows.push({
        ad_account_id: adAccountId,
        ad_id: ad.id,
        page_url: url,
      });
    }
  }

  if (pageMapRows.length > 0) {
    for (let i = 0; i < pageMapRows.length; i += 100) {
      const chunk = pageMapRows.slice(i, i + 100);
      const { error: mapError } = await supabase
        .from('meta_creative_page_map')
        .upsert(chunk, { onConflict: 'ad_account_id,ad_id,page_url' });

      if (mapError) {
        console.error(`[Sync] Failed to upsert page map (batch ${i}):`, mapError.message);
      }
    }
  }

  return {
    campaigns: campaigns.length,
    adsets: adsets.length,
    ads: ads.length,
  };
}

/**
 * Extracts the landing page URL from a Meta ad creative.
 * Tries multiple fields in order of reliability.
 */
function extractLandingPageUrl(ad: MetaAdResponse): string | null {
  const creative = ad.creative;
  if (!creative) return null;

  // Try direct URL fields first
  const candidates = [
    creative.object_url,
    creative.link_url,
    creative.object_story_spec?.link_data?.link,
    creative.object_story_spec?.video_data?.call_to_action?.value?.link,
  ];

  for (const url of candidates) {
    if (url && isValidHttpUrl(url)) return url;
  }

  return null;
}

function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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
/** Max days per Meta API request to avoid "reduce the amount of data" error */
const CHUNK_DAYS = 3;

export async function syncMetaInsightsDaily(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateEnd: string,
  conversionEvent: string = 'offsite_conversion.fb_pixel_purchase'
): Promise<number> {
  const supabase = createAdminClient();
  const decryptedToken = decrypt(accessToken);

  // Split date range into chunks to avoid Meta API payload limits
  const chunks = splitDateRange(dateStart, dateEnd, CHUNK_DAYS);
  let totalSynced = 0;

  for (let ci = 0; ci < chunks.length; ci++) {
    const { since, until } = chunks[ci];
    console.log(`[Sync] ${adAccountId} chunk ${ci + 1}/${chunks.length}: ${since} → ${until}`);

    let insights: MetaInsightResponse[];
    try {
      insights = await metaApiFetchAll<MetaInsightResponse>(
        `${adAccountId}/insights`,
        decryptedToken,
        {
          level: 'ad',
          time_increment: '1',
          time_range: JSON.stringify({ since, until }),
          fields:
            'ad_id,impressions,clicks,spend,cpm,cpc,ctr,frequency,reach,actions,action_values,video_play_actions,video_thruplay_watched_actions,video_avg_time_watched_actions',
        }
      );
    } catch (err) {
      // If a chunk still fails, try day-by-day as last resort
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const isDataTooLarge = (
        msg.includes('reduce the amount') ||
        msg.includes('reduza a quantidade') ||
        (err instanceof MetaApiException && err.code === 100)
      );
      if (isDataTooLarge) {
        console.warn(`[Sync] Chunk too large, falling back to day-by-day for ${since}→${until}`);
        const dayChunks = splitDateRange(since, until, 1);
        for (const day of dayChunks) {
          try {
            const dayInsights = await metaApiFetchAll<MetaInsightResponse>(
              `${adAccountId}/insights`,
              decryptedToken,
              {
                level: 'ad',
                time_increment: '1',
                time_range: JSON.stringify({ since: day.since, until: day.until }),
                fields:
                  'ad_id,impressions,clicks,spend,cpm,cpc,ctr,frequency,reach,actions,action_values,video_play_actions,video_thruplay_watched_actions,video_avg_time_watched_actions',
              }
            );
            totalSynced += await upsertInsights(supabase, adAccountId, dayInsights, conversionEvent);
          } catch (dayErr) {
            console.error(`[Sync] Day ${day.since} failed:`, dayErr instanceof Error ? dayErr.message : dayErr);
          }
        }
        continue;
      }
      throw err;
    }

    if (insights.length > 0) {
      totalSynced += await upsertInsights(supabase, adAccountId, insights, conversionEvent);
    }
  }

  return totalSynced;
}

/** Splits a date range into chunks of maxDays */
function splitDateRange(start: string, end: string, maxDays: number): Array<{ since: string; until: string }> {
  const chunks: Array<{ since: string; until: string }> = [];
  const endDate = new Date(end);
  let cursor = new Date(start);

  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const fmt = (d: Date) => d.toISOString().split('T')[0];
    chunks.push({ since: fmt(cursor), until: fmt(chunkEnd) });

    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

/** Converts raw Meta insight rows and upserts them into the database */
async function upsertInsights(
  supabase: ReturnType<typeof createAdminClient>,
  adAccountId: string,
  insights: MetaInsightResponse[],
  conversionEvent: string
): Promise<number> {
  const rows = insights.map((row) => {
    const conversions = extractConversions(row.actions, conversionEvent);
    const conversionValue = extractConversionValue(row.action_values, conversionEvent);

    // Frequency: use Meta's frequency field directly, or calculate from impressions/reach
    let frequency: number | null = null;
    if (row.frequency) {
      const parsed = parseFloat(row.frequency);
      if (!isNaN(parsed)) frequency = parsed;
    } else if (row.reach && row.impressions) {
      const reach = parseInt(row.reach, 10);
      const imp = parseInt(row.impressions, 10);
      if (reach > 0) frequency = imp / reach;
    }

    // Reach: store directly from API
    const reach = row.reach ? parseInt(row.reach, 10) : null;

    // Video metrics
    const video_views_3s = extractVideoMetric(row.video_play_actions);
    const video_thruplay = extractVideoMetric(row.video_thruplay_watched_actions);
    const video_avg_play_time = extractVideoAvgTime(row.video_avg_time_watched_actions);

    return {
      ad_account_id: adAccountId,
      ad_id: row.ad_id,
      date: row.date_start,
      impressions: parseInt(row.impressions || '0', 10),
      clicks: parseInt(row.clicks || '0', 10),
      spend: parseFloat(row.spend || '0'),
      conversions,
      conversion_value: conversionValue,
      cpm: row.cpm ? parseFloat(row.cpm) : null,
      cpc: row.cpc ? parseFloat(row.cpc) : null,
      ctr: row.ctr ? parseFloat(row.ctr) : null,
      frequency,
      reach,
      video_views_3s,
      video_thruplay,
      video_avg_play_time,
      updated_at: new Date().toISOString(),
    };
  });

  let totalSynced = 0;
  let skipFrequency = false;
  let skipReach = false;
  for (let i = 0; i < rows.length; i += 100) {
    let chunk = rows.slice(i, i + 100);
    if (skipFrequency) {
      chunk = chunk.map(({ frequency: _f, ...rest }) => rest) as typeof chunk;
    }
    if (skipReach) {
      chunk = chunk.map(({ reach: _r, ...rest }) => rest) as typeof chunk;
    }
    const { error } = await supabase
      .from('meta_ad_insights_daily')
      .upsert(chunk, { onConflict: 'ad_account_id,ad_id,date' });

    if (error) {
      // If frequency or reach column doesn't exist, retry batch without it
      if (!skipFrequency && error.message.includes('frequency')) {
        console.warn('[Sync] frequency column not found, retrying without it');
        skipFrequency = true;
        const fallbackChunk = rows.slice(i, i + 100).map(({ frequency: _f, ...rest }) => rest);
        const { error: retryErr } = await supabase
          .from('meta_ad_insights_daily')
          .upsert(fallbackChunk, { onConflict: 'ad_account_id,ad_id,date' });
        if (retryErr) {
          if (!skipReach && retryErr.message.includes('reach')) {
            console.warn('[Sync] reach column not found, retrying without it');
            skipReach = true;
            const fallback2 = rows.slice(i, i + 100).map(({ frequency: _f, reach: _r, ...rest }) => rest);
            const { error: retry2Err } = await supabase
              .from('meta_ad_insights_daily')
              .upsert(fallback2, { onConflict: 'ad_account_id,ad_id,date' });
            if (retry2Err) throw new Error(`Failed to upsert insights (batch ${i}): ${retry2Err.message}`);
            totalSynced += fallback2.length;
            continue;
          }
          throw new Error(`Failed to upsert insights (batch ${i}): ${retryErr.message}`);
        }
        totalSynced += fallbackChunk.length;
        continue;
      }
      if (!skipReach && error.message.includes('reach')) {
        console.warn('[Sync] reach column not found, retrying without it');
        skipReach = true;
        const fallbackChunk = rows.slice(i, i + 100).map(({ reach: _r, ...rest }) => rest);
        const { error: retryErr } = await supabase
          .from('meta_ad_insights_daily')
          .upsert(fallbackChunk, { onConflict: 'ad_account_id,ad_id,date' });
        if (retryErr) throw new Error(`Failed to upsert insights (batch ${i}): ${retryErr.message}`);
        totalSynced += fallbackChunk.length;
        continue;
      }
      throw new Error(`Failed to upsert insights (batch ${i}): ${error.message}`);
    }
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

/** Extract video view count (3s or thruplay) from Meta's video action arrays */
function extractVideoMetric(
  actions: Array<{ action_type: string; value: string }> | undefined
): number | null {
  if (!actions || actions.length === 0) return null;
  // Meta returns these with action_type "video_view" or similar
  const total = actions.reduce((sum, a) => sum + parseInt(a.value || '0', 10), 0);
  return total > 0 ? total : null;
}

/** Extract average video play time in seconds */
function extractVideoAvgTime(
  actions: Array<{ action_type: string; value: string }> | undefined
): number | null {
  if (!actions || actions.length === 0) return null;
  const first = actions[0];
  if (first) {
    const val = parseFloat(first.value);
    return !isNaN(val) && val > 0 ? val : null;
  }
  return null;
}

// ============================================================
// Sync Placement Insights
// ============================================================

/**
 * Syncs placement-level insights (publisher_platform × platform_position).
 * This is a separate API call because Meta requires breakdowns to be
 * in a separate request from time_increment queries.
 */
export async function syncPlacementInsights(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateEnd: string,
  conversionEvent: string = 'offsite_conversion.fb_pixel_purchase'
): Promise<number> {
  const supabase = createAdminClient();
  const decryptedToken = decrypt(accessToken);

  const chunks = splitDateRange(dateStart, dateEnd, CHUNK_DAYS);
  let totalSynced = 0;

  for (const { since, until } of chunks) {
    try {
      const insights = await metaApiFetchAll<MetaPlacementInsightResponse>(
        `${adAccountId}/insights`,
        decryptedToken,
        {
          level: 'ad',
          time_increment: '1',
          time_range: JSON.stringify({ since, until }),
          breakdowns: 'publisher_platform,platform_position',
          fields: 'ad_id,impressions,clicks,spend,reach,cpm,cpc,ctr,actions',
        }
      );

      if (insights.length === 0) continue;

      const rows = insights.map((row) => {
        const conversions = extractConversions(row.actions, conversionEvent);
        return {
          ad_account_id: adAccountId,
          ad_id: row.ad_id,
          date: row.date_start,
          publisher_platform: row.publisher_platform || 'unknown',
          platform_position: row.platform_position || 'unknown',
          impressions: parseInt(row.impressions || '0', 10),
          clicks: parseInt(row.clicks || '0', 10),
          spend: parseFloat(row.spend || '0'),
          conversions,
          reach: row.reach ? parseInt(row.reach, 10) : null,
          cpm: row.cpm ? parseFloat(row.cpm) : null,
          cpc: row.cpc ? parseFloat(row.cpc) : null,
          ctr: row.ctr ? parseFloat(row.ctr) : null,
          updated_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabase
          .from('meta_ad_insights_placement')
          .upsert(chunk, { onConflict: 'ad_account_id,ad_id,date,publisher_platform,platform_position' });

        if (error) {
          // If table doesn't exist yet, skip gracefully
          if (error.message.includes('meta_ad_insights_placement')) {
            console.warn('[Sync] Placement table not found, skipping');
            return 0;
          }
          throw new Error(`Failed to upsert placement insights (batch ${i}): ${error.message}`);
        }
        totalSynced += chunk.length;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('reduce the amount') || msg.includes('reduza a quantidade')) {
        console.warn(`[Sync] Placement chunk too large, skipping ${since}→${until}`);
        continue;
      }
      // Placement sync is non-critical — log and continue
      console.error(`[Sync] Placement sync failed for ${since}→${until}:`, err instanceof Error ? err.message : err);
    }
  }

  return totalSynced;
}

// ============================================================
// Token Auto-Refresh
// ============================================================

/** Minimum days before expiration to trigger auto-refresh */
const REFRESH_THRESHOLD_DAYS = 7;

/**
 * Checks if the token is close to expiring and refreshes it automatically.
 * Returns the (possibly updated) encrypted access token to use for sync.
 * System User tokens never expire, so refresh is skipped for them.
 */
async function maybeRefreshToken(
  adAccountId: string,
  encryptedToken: string,
  credentialType: CredentialType = 'user'
): Promise<string> {
  // System User tokens don't expire — skip refresh entirely
  if (credentialType === 'system_user') {
    console.log(`[Token] System user token for ${adAccountId} — no refresh needed`);
    return encryptedToken;
  }

  const supabase = createAdminClient();

  // Get current token_expires_at
  const { data: account } = await supabase
    .from('meta_accounts')
    .select('token_expires_at')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!account?.token_expires_at) return encryptedToken;

  const expiresAt = new Date(account.token_expires_at);
  const now = new Date();
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry > REFRESH_THRESHOLD_DAYS) {
    return encryptedToken; // Still fresh, no refresh needed
  }

  if (daysUntilExpiry <= 0) {
    console.warn(`[Token] Token for ${adAccountId} already expired. Cannot auto-refresh.`);
    return encryptedToken; // Already expired, can't refresh
  }

  // Token is expiring soon — refresh it
  console.log(`[Token] Auto-refreshing token for ${adAccountId} (expires in ${daysUntilExpiry.toFixed(1)} days)`);
  try {
    const currentToken = decrypt(encryptedToken);
    const { access_token: newToken, expires_in } = await refreshLongLivedToken(currentToken);
    const newEncrypted = encrypt(newToken);
    const newExpiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Update ALL accounts of this user that share the same token
    // (Meta tokens are per-user, not per-account)
    const { data: sameUser } = await supabase
      .from('meta_accounts')
      .select('user_id')
      .eq('ad_account_id', adAccountId)
      .single();

    if (sameUser) {
      await supabase
        .from('meta_accounts')
        .update({
          access_token: newEncrypted,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', sameUser.user_id);
    }

    console.log(`[Token] Refreshed token for ${adAccountId}, new expiry: ${newExpiresAt}`);
    return newEncrypted;
  } catch (err) {
    console.error(`[Token] Failed to refresh token for ${adAccountId}:`, err);
    return encryptedToken; // Use existing token, will fail at sync if truly expired
  }
}

// ============================================================
// Full Sync Orchestrator (legacy — wraps incremental)
// ============================================================

export async function runFullSync(
  adAccountId: string,
  accessToken: string,
  conversionEvent: string,
  dateStart: string,
  dateEnd: string,
  credentialType: CredentialType = 'user'
): Promise<{
  structure: { campaigns: number; adsets: number; ads: number };
  insights: number;
}> {
  const supabase = createAdminClient();

  // Auto-refresh token if expiring within 7 days (skipped for system_user)
  accessToken = await maybeRefreshToken(adAccountId, accessToken, credentialType);

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

    // Placement breakdown sync (non-blocking — failures don't break the main sync)
    let placementCount = 0;
    try {
      placementCount = await syncPlacementInsights(
        adAccountId, accessToken, dateStart, dateEnd, conversionEvent
      );
    } catch (placementErr) {
      console.warn('[Sync] Placement sync failed (non-critical):', placementErr instanceof Error ? placementErr.message : placementErr);
    }

    // Update sync log
    if (syncLog) {
      await supabase
        .from('meta_sync_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          records_synced:
            structure.campaigns + structure.adsets + structure.ads + insights + placementCount,
        })
        .eq('id', syncLog.id);
    }

    return { structure, insights };
  } catch (error) {
    // Report auth errors to credential health
    if (error instanceof MetaApiException && error.isTokenExpired) {
      console.error(`[Sync] Token expired for ${adAccountId} (credential_type: ${credentialType})`);
      await updateCredentialHealth(adAccountId, 'expired');
    }

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

// ============================================================
// Incremental Sync (recent days — runs every cron)
// ============================================================

/**
 * Syncs the last INCREMENTAL_DAYS of data (today, yesterday, day before).
 * This ensures attribution corrections are captured and today's partial
 * data is never missed.
 *
 * Also syncs structure (campaigns, adsets, ads) every time.
 */
export async function runIncrementalSync(
  adAccountId: string,
  accessToken: string,
  conversionEvent: string,
  credentialType: CredentialType = 'user'
): Promise<{
  structure: { campaigns: number; adsets: number; ads: number };
  insights: number;
  dateStart: string;
  dateEnd: string;
}> {
  const supabase = createAdminClient();
  accessToken = await maybeRefreshToken(adAccountId, accessToken, credentialType);

  const today = new TZDate(new Date(), TIMEZONE);
  const dateEnd = format(today, 'yyyy-MM-dd');
  const dateStart = format(subDays(today, INCREMENTAL_DAYS - 1), 'yyyy-MM-dd');

  console.log(`[Incremental] ${adAccountId}: syncing ${dateStart} → ${dateEnd}`);

  const { data: syncLog } = await supabase
    .from('meta_sync_log')
    .insert({ ad_account_id: adAccountId, sync_type: 'incremental', status: 'running' })
    .select('id')
    .single();

  // Structure sync is non-blocking — failures should not prevent insights sync
  let structure = { campaigns: 0, adsets: 0, ads: 0 };
  try {
    structure = await syncMetaStructure(adAccountId, accessToken);
  } catch (structErr) {
    console.warn('[Incremental] Structure sync failed (non-critical):', structErr instanceof Error ? structErr.message : structErr);
    // If token is expired, re-throw — insights will also fail
    if (structErr instanceof MetaApiException && structErr.isTokenExpired) {
      throw structErr;
    }
  }

  try {
    const insights = await syncMetaInsightsDaily(
      adAccountId, accessToken, dateStart, dateEnd, conversionEvent
    );

    // Placement sync (non-blocking)
    let placementCount = 0;
    try {
      placementCount = await syncPlacementInsights(
        adAccountId, accessToken, dateStart, dateEnd, conversionEvent
      );
    } catch (e) {
      console.warn('[Incremental] Placement sync failed (non-critical):', e instanceof Error ? e.message : e);
    }

    if (syncLog) {
      await supabase.from('meta_sync_log').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_synced: structure.campaigns + structure.adsets + structure.ads + insights + placementCount,
      }).eq('id', syncLog.id);
    }

    console.log(`[Incremental] ${adAccountId}: done — ${insights} insight rows synced`);
    return { structure, insights, dateStart, dateEnd };
  } catch (error) {
    if (error instanceof MetaApiException && error.isTokenExpired) {
      await updateCredentialHealth(adAccountId, 'expired');
    }
    if (syncLog) {
      await supabase.from('meta_sync_log').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).eq('id', syncLog.id);
    }
    throw error;
  }
}

// ============================================================
// Backfill Historical Data
// ============================================================

/**
 * Fetches the account creation date from Meta API.
 * This determines how far back we can go for historical data.
 */
async function getAccountCreatedTime(
  adAccountId: string,
  accessToken: string
): Promise<string> {
  try {
    const data = await metaApiFetch<{ created_time?: string }>(
      adAccountId,
      accessToken,
      { fields: 'created_time' }
    );
    if (data.created_time) {
      return data.created_time.split('T')[0];
    }
  } catch (e) {
    console.warn(`[Backfill] Could not fetch account creation date for ${adAccountId}:`, e instanceof Error ? e.message : e);
  }
  // Fallback: 3 years ago (Meta API limit for insights is ~37 months)
  return fmtDate(new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000));
}

/**
 * Progressive backfill: fetches historical data working backwards from the
 * current cursor position. Processes one chunk (BACKFILL_CHUNK_DAYS) per call,
 * saving the cursor after each chunk so it can resume across cron runs.
 *
 * Meta API limitation: Insights data is available for up to 37 months.
 * The backfill respects this and goes as far back as possible.
 *
 * @returns Summary of what was synced, or null if backfill is already complete.
 */
export async function runBackfillChunk(
  adAccountId: string,
  accessToken: string,
  conversionEvent: string,
  credentialType: CredentialType = 'user'
): Promise<{
  insights: number;
  dateStart: string;
  dateEnd: string;
  backfillComplete: boolean;
  oldestDate: string | null;
} | null> {
  const supabase = createAdminClient();
  accessToken = await maybeRefreshToken(adAccountId, accessToken, credentialType);
  const decryptedToken = decrypt(accessToken);

  // Get current backfill state
  const { data: account } = await supabase
    .from('meta_accounts')
    .select('backfill_status, backfill_cursor, backfill_oldest_date')
    .eq('ad_account_id', adAccountId)
    .single();

  if (account?.backfill_status === 'completed') {
    console.log(`[Backfill] ${adAccountId}: already completed, skipping`);
    return null;
  }

  // Determine the floor: account creation date or Meta API limit (~37 months)
  const metaApiLimit = fmtDate(new Date(Date.now() - 37 * 30 * 24 * 60 * 60 * 1000));
  const accountCreated = await getAccountCreatedTime(adAccountId, decryptedToken);
  const floorDate = accountCreated > metaApiLimit ? accountCreated : metaApiLimit;

  // Determine where to start this chunk
  const today = new TZDate(new Date(), TIMEZONE);
  const todayStr = format(today, 'yyyy-MM-dd');

  let chunkEnd: string;
  if (account?.backfill_cursor) {
    // Continue from where we left off (one day before the cursor)
    const cursor = new Date(account.backfill_cursor);
    cursor.setDate(cursor.getDate() - 1);
    chunkEnd = fmtDate(cursor);
  } else {
    // First backfill: start from INCREMENTAL_DAYS ago (incremental handles recent days)
    chunkEnd = fmtDate(subDays(today, INCREMENTAL_DAYS));
  }

  // If we've already gone past the floor, backfill is complete
  if (chunkEnd < floorDate) {
    console.log(`[Backfill] ${adAccountId}: completed! Floor date: ${floorDate}`);
    await supabase.from('meta_accounts').update({
      backfill_status: 'completed',
      backfill_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('ad_account_id', adAccountId);
    return null;
  }

  // Calculate chunk start (go back BACKFILL_CHUNK_DAYS from chunkEnd)
  const chunkStartDate = new Date(chunkEnd);
  chunkStartDate.setDate(chunkStartDate.getDate() - BACKFILL_CHUNK_DAYS + 1);
  const chunkStart = chunkStartDate < new Date(floorDate) ? floorDate : fmtDate(chunkStartDate);

  console.log(`[Backfill] ${adAccountId}: chunk ${chunkStart} → ${chunkEnd} (floor: ${floorDate})`);

  // Mark as running
  await supabase.from('meta_accounts').update({
    backfill_status: 'running',
    updated_at: new Date().toISOString(),
  }).eq('ad_account_id', adAccountId);

  const { data: syncLog } = await supabase
    .from('meta_sync_log')
    .insert({ ad_account_id: adAccountId, sync_type: 'backfill', status: 'running' })
    .select('id')
    .single();

  try {
    const insights = await syncMetaInsightsDaily(
      adAccountId, accessToken, chunkStart, chunkEnd, conversionEvent
    );

    // Also sync placement for this chunk (non-blocking)
    try {
      await syncPlacementInsights(adAccountId, accessToken, chunkStart, chunkEnd, conversionEvent);
    } catch (e) {
      console.warn('[Backfill] Placement sync failed (non-critical):', e instanceof Error ? e.message : e);
    }

    // Check if backfill is now complete
    const backfillComplete = chunkStart <= floorDate;

    // Update cursor and oldest date
    await supabase.from('meta_accounts').update({
      backfill_status: backfillComplete ? 'completed' : 'pending',
      backfill_cursor: chunkStart,
      backfill_oldest_date: chunkStart,
      backfill_completed_at: backfillComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('ad_account_id', adAccountId);

    if (syncLog) {
      await supabase.from('meta_sync_log').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        records_synced: insights,
      }).eq('id', syncLog.id);
    }

    console.log(`[Backfill] ${adAccountId}: chunk done — ${insights} rows, complete: ${backfillComplete}`);

    return {
      insights,
      dateStart: chunkStart,
      dateEnd: chunkEnd,
      backfillComplete,
      oldestDate: chunkStart,
    };
  } catch (error) {
    if (error instanceof MetaApiException && error.isTokenExpired) {
      await updateCredentialHealth(adAccountId, 'expired');
    }

    // Save cursor even on failure so we can retry from same position
    await supabase.from('meta_accounts').update({
      backfill_status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('ad_account_id', adAccountId);

    if (syncLog) {
      await supabase.from('meta_sync_log').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
      }).eq('id', syncLog.id);
    }

    throw error;
  }
}
