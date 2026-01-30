import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ────────────────────────────────────────────────────

export interface GA4PageRow {
  date: string;
  pagePath: string;
  hostname: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTime: number;
  source: string;
  medium: string;
  campaign: string;
}

export interface GA4PageAggregated {
  pagePath: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTime: number;
  connectRate: number | null;
  status: 'OK' | 'ATENCAO' | 'TRAVAR TRAFEGO';
  statusReason: string;
}

// ── Status thresholds ────────────────────────────────────────
// Status e determinado por: Connect Rate + Engage Rate + Sessoes Engajadas
// Conversoes NAO influenciam status.

const THRESHOLDS = {
  connectRate: { ok: 70, attention: 40 },
  engagementRate: { ok: 0.5, attention: 0.3 },
};

export function computePageStatus(
  connectRate: number | null,
  engagementRate: number,
  sessions: number,
  engagedSessions: number
): { status: 'OK' | 'ATENCAO' | 'TRAVAR TRAFEGO'; reason: string } {
  // Connect Rate e a metrica primaria (problema tecnico de entrega)
  if (connectRate !== null) {
    if (connectRate < THRESHOLDS.connectRate.attention) {
      return { status: 'TRAVAR TRAFEGO', reason: `Connect Rate critico: ${connectRate.toFixed(1)}% (< 40%)` };
    }
    if (connectRate < THRESHOLDS.connectRate.ok) {
      return { status: 'ATENCAO', reason: `Connect Rate baixo: ${connectRate.toFixed(1)}% (40-70%)` };
    }
  }

  // Engage Rate como indicador de qualidade da pagina
  if (engagementRate < THRESHOLDS.engagementRate.attention) {
    return { status: 'TRAVAR TRAFEGO', reason: `Engage Rate critico: ${(engagementRate * 100).toFixed(1)}% (< 30%)` };
  }
  if (engagementRate < THRESHOLDS.engagementRate.ok) {
    return { status: 'ATENCAO', reason: `Engage Rate baixo: ${(engagementRate * 100).toFixed(1)}% (30-50%)` };
  }

  // Sessoes engajadas vs total
  if (sessions > 0) {
    const engagedRatio = engagedSessions / sessions;
    if (engagedRatio < 0.3) {
      return { status: 'ATENCAO', reason: `Poucas sessoes engajadas: ${(engagedRatio * 100).toFixed(0)}%` };
    }
  }

  return { status: 'OK', reason: 'Metricas dentro do esperado' };
}

// ── GA4 Client ───────────────────────────────────────────────

let _client: BetaAnalyticsDataClient | null = null;

function getClient(): BetaAnalyticsDataClient {
  if (_client) return _client;

  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY must be set');
  }

  _client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });

  return _client;
}

// ── List GA4 Properties (Admin API) ──────────────────────────

let _adminClient: AnalyticsAdminServiceClient | null = null;

function getAdminClient(): AnalyticsAdminServiceClient {
  if (_adminClient) return _adminClient;

  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('GA4_CLIENT_EMAIL and GA4_PRIVATE_KEY must be set');
  }

  _adminClient = new AnalyticsAdminServiceClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  });

  return _adminClient;
}

export interface GA4Property {
  propertyId: string;
  displayName: string;
}

export async function listGA4Properties(): Promise<GA4Property[]> {
  const client = getAdminClient();
  const properties: GA4Property[] = [];

  try {
    const [accounts] = await client.listAccountSummaries({});
    for (const account of accounts || []) {
      for (const prop of account.propertySummaries || []) {
        if (prop.property && prop.displayName) {
          // prop.property is "properties/123456789"
          const id = prop.property.replace('properties/', '');
          properties.push({
            propertyId: id,
            displayName: prop.displayName,
          });
        }
      }
    }
  } catch (err) {
    console.error('[GA4] Failed to list properties:', err instanceof Error ? err.message : err);
  }

  return properties;
}

// ── Fetch from GA4 API ───────────────────────────────────────

export async function fetchGA4PageMetrics(
  propertyId: string,
  startDate: string,
  endDate: string,
  hostnames?: string[]
): Promise<GA4PageRow[]> {
  const client = getClient();

  // Build dimension filter: restrict to known hostnames from Meta Ads landing pages
  let dimensionFilter: Record<string, unknown> | undefined;
  if (hostnames && hostnames.length === 1) {
    dimensionFilter = {
      filter: {
        fieldName: 'hostName',
        stringFilter: { matchType: 'EXACT' as const, value: hostnames[0] },
      },
    };
  } else if (hostnames && hostnames.length > 1) {
    dimensionFilter = {
      orGroup: {
        expressions: hostnames.map((h) => ({
          filter: {
            fieldName: 'hostName',
            stringFilter: { matchType: 'EXACT' as const, value: h },
          },
        })),
      },
    };
  }

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'date' },
      { name: 'pagePath' },
      { name: 'hostName' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignName' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
    ],
    dimensionFilter: dimensionFilter,
    keepEmptyRows: false,
    limit: 10000,
  });

  const rows: GA4PageRow[] = [];

  for (const row of response.rows || []) {
    const dims = row.dimensionValues || [];
    const mets = row.metricValues || [];

    rows.push({
      date: dims[0]?.value || '',
      pagePath: dims[1]?.value || '',
      hostname: dims[2]?.value || '',
      sessions: parseInt(mets[0]?.value || '0', 10),
      engagedSessions: parseInt(mets[1]?.value || '0', 10),
      engagementRate: parseFloat(mets[2]?.value || '0'),
      avgEngagementTime: parseFloat(mets[3]?.value || '0'),
      source: dims[3]?.value || '(direct)',
      medium: dims[4]?.value || '(none)',
      campaign: dims[5]?.value || '(not set)',
    });
  }

  return rows;
}

// ── GA4 Property lookup ──────────────────────────────────────

export interface GA4Config {
  propertyId: string;
  /** Hostnames auto-detected from Meta Ads landing pages for this account */
  hostnames: string[];
}

export async function getGA4PropertyId(
  adAccountId: string
): Promise<string | null> {
  const config = await getGA4Config(adAccountId);
  return config?.propertyId || null;
}

export async function getGA4Config(
  adAccountId: string
): Promise<GA4Config | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('ga4_configs')
    .select('ga4_property_id')
    .eq('ad_account_id', adAccountId)
    .single();

  if (!data?.ga4_property_id) return null;

  // ga4_property_id can be "propertyId" or "propertyId|hostname1,hostname2"
  const raw = data.ga4_property_id;
  const pipeIndex = raw.indexOf('|');
  let propertyId: string;
  let configuredHostnames: string[] = [];

  if (pipeIndex > -1) {
    propertyId = raw.substring(0, pipeIndex);
    configuredHostnames = raw.substring(pipeIndex + 1).split(',').map((h: string) => h.trim()).filter(Boolean);
  } else {
    propertyId = raw;
  }

  // Use configured hostnames first, fallback to auto-detect from meta_creative_page_map
  let hostnames = configuredHostnames;
  if (hostnames.length === 0) {
    hostnames = await detectHostnamesForAccount(adAccountId);
  }

  return {
    propertyId,
    hostnames,
  };
}

/**
 * Extracts unique hostnames from landing page URLs in meta_creative_page_map.
 * This is the automatic link — no manual hostname config needed.
 */
async function detectHostnamesForAccount(adAccountId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: pageMap } = await supabase
    .from('meta_creative_page_map')
    .select('page_url')
    .eq('ad_account_id', adAccountId);

  if (!pageMap || pageMap.length === 0) return [];

  const hostnameSet = new Set<string>();
  for (const pm of pageMap) {
    try {
      const url = new URL(pm.page_url);
      if (url.hostname) hostnameSet.add(url.hostname);
    } catch {
      // Skip invalid URLs
    }
  }

  return Array.from(hostnameSet);
}

// ── Persist to Supabase ──────────────────────────────────────

export async function persistGA4Data(
  adAccountId: string,
  rows: GA4PageRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const supabase = createAdminClient();

  const records = rows.map((r) => ({
    ad_account_id: adAccountId,
    date: r.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
    page_path: r.pagePath,
    sessions: r.sessions,
    engaged_sessions: r.engagedSessions,
    engagement_rate: r.engagementRate,
    avg_engagement_time: r.avgEngagementTime,
    conversions: 0,
    event_count: 0,
    source: r.source,
    medium: r.medium,
    campaign: r.campaign,
  }));

  // Upsert in chunks of 500
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await supabase
      .from('ga4_page_daily')
      .upsert(chunk, {
        onConflict: 'ad_account_id,date,page_path,source,medium,campaign',
      });

    if (error) {
      console.error('[GA4] Persist error:', error);
      throw new Error(`Failed to persist GA4 data: ${error.message}`);
    }
  }
}

// ── Aggregate page metrics ───────────────────────────────────

export function aggregateByPage(
  rows: GA4PageRow[],
  metaClicksByPage?: Map<string, number>
): GA4PageAggregated[] {
  const map = new Map<
    string,
    {
      sessions: number;
      engagedSessions: number;
      engagementRateSum: number;
      avgEngagementTimeSum: number;
      count: number;
    }
  >();

  for (const r of rows) {
    const key = r.pagePath;
    const existing = map.get(key) || {
      sessions: 0,
      engagedSessions: 0,
      engagementRateSum: 0,
      avgEngagementTimeSum: 0,
      count: 0,
    };

    existing.sessions += r.sessions;
    existing.engagedSessions += r.engagedSessions;
    existing.engagementRateSum += r.engagementRate * r.sessions;
    existing.avgEngagementTimeSum += r.avgEngagementTime * r.sessions;
    existing.count++;
    map.set(key, existing);
  }

  const results: GA4PageAggregated[] = [];

  for (const [pagePath, agg] of map) {
    const sessions = agg.sessions;
    const engagedSessions = agg.engagedSessions;
    const engagementRate = sessions > 0 ? agg.engagementRateSum / sessions : 0;
    const avgEngagementTime = sessions > 0 ? agg.avgEngagementTimeSum / sessions : 0;

    const metaClicks = metaClicksByPage?.get(pagePath) ?? null;
    const connectRate = metaClicks !== null && metaClicks > 0
      ? (sessions / metaClicks) * 100
      : null;

    const { status, reason } = computePageStatus(connectRate, engagementRate, sessions, engagedSessions);

    results.push({
      pagePath,
      sessions,
      engagedSessions,
      engagementRate,
      avgEngagementTime,
      connectRate,
      status,
      statusReason: reason,
    });
  }

  return results.sort((a, b) => b.sessions - a.sessions);
}

// ── Realtime data from GA4 ───────────────────────────────────

export interface GA4RealtimeData {
  activeUsers: number;
  activePages: number;
  topPages: { pagePath: string; activeUsers: number }[];
}

export async function fetchGA4Realtime(
  propertyId: string,
  _hostnames?: string[]
): Promise<GA4RealtimeData> {
  const client = getClient();

  // Note: GA4 Realtime API does not support hostName dimension filter.
  // Filtering is not applied here — realtime data is property-wide.
  const [response] = await client.runRealtimeReport({
    property: `properties/${propertyId}`,
    dimensions: [{ name: 'unifiedPagePathScreen' }],
    metrics: [{ name: 'activeUsers' }],
  });

  const topPages: { pagePath: string; activeUsers: number }[] = [];
  let totalActiveUsers = 0;

  for (const row of response.rows || []) {
    const pagePath = row.dimensionValues?.[0]?.value || '';
    const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
    totalActiveUsers += users;
    topPages.push({ pagePath, activeUsers: users });
  }

  topPages.sort((a, b) => b.activeUsers - a.activeUsers);

  return {
    activeUsers: totalActiveUsers,
    activePages: topPages.length,
    topPages: topPages.slice(0, 10),
  };
}

// ── Full sync for an account ─────────────────────────────────

export async function syncGA4ForAccount(
  adAccountId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const config = await getGA4Config(adAccountId);
  if (!config) return 0;

  const rows = await fetchGA4PageMetrics(config.propertyId, startDate, endDate, config.hostnames);
  await persistGA4Data(adAccountId, rows);
  return rows.length;
}
