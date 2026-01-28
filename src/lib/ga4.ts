import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { createAdminClient } from '@/lib/supabase/admin';

// ── Types ────────────────────────────────────────────────────

export interface GA4PageRow {
  date: string;
  pagePath: string;
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

// ── Fetch from GA4 API ───────────────────────────────────────

export async function fetchGA4PageMetrics(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<GA4PageRow[]> {
  const client = getClient();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'date' },
      { name: 'pagePath' },
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
      sessions: parseInt(mets[0]?.value || '0', 10),
      engagedSessions: parseInt(mets[1]?.value || '0', 10),
      engagementRate: parseFloat(mets[2]?.value || '0'),
      avgEngagementTime: parseFloat(mets[3]?.value || '0'),
      source: dims[2]?.value || '(direct)',
      medium: dims[3]?.value || '(none)',
      campaign: dims[4]?.value || '(not set)',
    });
  }

  return rows;
}

// ── GA4 Property lookup ──────────────────────────────────────

export async function getGA4PropertyId(
  adAccountId: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('ga4_configs')
    .select('ga4_property_id')
    .eq('ad_account_id', adAccountId)
    .single();

  return data?.ga4_property_id || null;
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

// ── Full sync for an account ─────────────────────────────────

export async function syncGA4ForAccount(
  adAccountId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const propertyId = await getGA4PropertyId(adAccountId);
  if (!propertyId) return 0;

  const rows = await fetchGA4PageMetrics(propertyId, startDate, endDate);
  await persistGA4Data(adAccountId, rows);
  return rows.length;
}
