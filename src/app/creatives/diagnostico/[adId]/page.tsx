'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { StatusBadge } from '@/components/creatives/status-badge';
import { useAccount } from '@/components/creatives/account-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ImageIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { format as fmtDate, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency, formatPercent, formatNumber, formatCompact } from '@/lib/format';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  calculateStatus,
  calculateAccountBenchmarkCTR,
  generateDiagnosticText,
  DEFAULT_SETTINGS,
  type CreativeMetrics,
  type DecisionStatus,
  type CampaignType,
} from '@/lib/decision-engine';

interface DailyRow {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  frequency: number;
}

interface AdDetail {
  ad_id: string;
  name: string;
  thumbnail_url: string | null;
  format: string;
  campaign_id: string;
  campaign_name: string;
  campaign_type: CampaignType;
  adset_name: string;
}

export default function DiagnosticoDetailPage() {
  const params = useParams();
  const adId = params.adId as string;
  const { selectedAccount, dateStart, dateEnd } = useAccount();

  const [ad, setAd] = useState<AdDetail | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [accountCreatives, setAccountCreatives] = useState<CreativeMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!adId || !selectedAccount || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const [diagRes, cmdRes] = await Promise.all([
        fetch(
          `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=diagnostic&ad_id=${adId}`
        ),
        fetch(
          `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=command`
        ),
      ]);

      if (diagRes.ok) {
        const data = await diagRes.json();
        setAd(data.ad ? {
          ...data.ad,
          campaign_type: data.ad.campaign_type || 'VENDAS',
        } : null);
        setDaily(data.daily || []);
      }

      if (cmdRes.ok) {
        const data = await cmdRes.json();
        setAccountCreatives(data.creatives || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [adId, selectedAccount, dateStart, dateEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute metrics from daily data
  const totalImpressions = daily.reduce((s, d) => s + (d.impressions || 0), 0);
  const totalClicks = daily.reduce((s, d) => s + (d.clicks || 0), 0);
  const totalSpend = daily.reduce((s, d) => s + Number(d.spend || 0), 0);
  const totalConversions = daily.reduce((s, d) => s + (d.conversions || 0), 0);
  const avgFrequency = daily.length > 0
    ? daily.reduce((s, d) => s + Number(d.frequency || 0), 0) / daily.length
    : 0;

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : null;
  const cpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : null;
  const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

  // Hook Rate = Clicks / Impressions (metric of visual attraction)
  const hookRate = totalImpressions > 0
    ? (totalClicks / totalImpressions) * 100
    : null;

  // Campaign type
  const campaignType: CampaignType = ad?.campaign_type || 'VENDAS';
  const isCaptura = campaignType === 'CAPTURA';
  const costLabel = isCaptura ? 'CPL' : 'CPA';
  const convLabel = isCaptura ? 'Leads' : 'Vendas';
  const costTarget = isCaptura ? DEFAULT_SETTINGS.cpl_target : DEFAULT_SETTINGS.cpa_target;

  // Chart data
  const chartData = daily.map((d) => {
    const dayCtr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
    const dayHookRate = d.impressions > 0
      ? (d.clicks / d.impressions) * 100
      : null;
    return {
      label: fmtDate(parseISO(d.date), 'dd/MM', { locale: ptBR }),
      ctr: Number(dayCtr.toFixed(2)),
      hookRate: dayHookRate ? Number(dayHookRate.toFixed(2)) : null,
      clicks: d.clicks,
      conversions: d.conversions,
    };
  });

  const creative: CreativeMetrics = {
    ad_id: adId,
    name: ad?.name || '',
    thumbnail_url: ad?.thumbnail_url || null,
    format: ad?.format || '',
    campaign_id: ad?.campaign_id || '',
    campaign_name: ad?.campaign_name || '',
    campaign_type: campaignType,
    ctr,
    compras: totalConversions,
    cpa: costPerConversion,
    frequency: avgFrequency,
    spend: totalSpend,
    impressions: totalImpressions,
    clicks: totalClicks,
    cpc,
    cpm,
    hook_rate: hookRate,
  };

  const accountCtr = calculateAccountBenchmarkCTR(accountCreatives);
  const { status } = calculateStatus(creative, { ...DEFAULT_SETTINGS, ctr_benchmark: accountCtr });
  const diagnosticText = generateDiagnosticText(creative, DEFAULT_SETTINGS, accountCtr);

  function TrendIcon({ value }: { value: number }) {
    if (value > 0.1) return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
    if (value < -0.1) return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  }

  return (
      <div className="flex flex-1 flex-col px-6 py-4">
        {/* Back button + header */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/creatives">
            <Button variant="ghost" size="sm" className="h-8 px-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {loading ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <div className="flex items-center gap-3">
              {ad?.thumbnail_url ? (
                <Image src={ad.thumbnail_url} alt="" width={40} height={40} className="rounded object-cover" unoptimized />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold truncate max-w-[400px]">{ad?.name || adId}</h1>
                  <StatusBadge status={status as DecisionStatus} />
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isCaptura ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400' : 'bg-blue-500/10 text-blue-700 dark:text-blue-400'}`}>
                    {isCaptura ? 'CAPTURA' : 'VENDAS'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {ad?.campaign_name} &middot; {ad?.adset_name}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Diagnostic text */}
        {!loading && (
          <div className="rounded-lg border bg-card p-4 mb-4">
            <div className="text-sm font-medium mb-1">Diagnostico Automatico</div>
            <p className="text-sm text-muted-foreground">{diagnosticText}</p>
          </div>
        )}

        {/* Primary metrics row — adapted by campaign type */}
        <div className={`grid gap-3 mb-4 ${isCaptura ? 'grid-cols-5' : 'grid-cols-5'}`}>
          {/* Highlight: Cost per conversion (CPA or CPL) */}
          <DiagMetric
            label={costLabel}
            value={formatCurrency(costPerConversion)}
            sub={`Alvo: ${formatCurrency(costTarget)}`}
            loading={loading}
            highlight={costPerConversion !== null && costPerConversion <= costTarget}
          />
          <DiagMetric label={convLabel} value={formatNumber(totalConversions)} loading={loading} />
          {isCaptura ? (
            <DiagMetric
              label="Taxa Conv. Pagina"
              value={formatPercent(conversionRate)}
              sub={`${totalClicks} cliques → ${totalConversions} leads`}
              loading={loading}
            />
          ) : (
            <DiagMetric label="Gasto" value={formatCurrency(totalSpend)} loading={loading} />
          )}
          <DiagMetric label="CTR" value={formatPercent(ctr)} sub={`Conta: ${formatPercent(accountCtr)}`} loading={loading} />
          <DiagMetric
            label="Frequencia"
            value={avgFrequency > 0 ? avgFrequency.toFixed(1) : '-'}
            sub={avgFrequency > 0
              ? (avgFrequency >= DEFAULT_SETTINGS.frequency_kill
                ? 'CRITICO'
                : avgFrequency >= DEFAULT_SETTINGS.frequency_warn
                  ? 'ALERTA'
                  : 'Normal')
              : 'Sem dados'}
            loading={loading}
            highlight={false}
          />
        </div>

        {/* Secondary metrics row */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <DiagMetric label="CPC" value={formatCurrency(cpc)} loading={loading} />
          <DiagMetric label="CPM" value={formatCurrency(cpm)} loading={loading} />
          {isCaptura ? (
            <DiagMetric label="Gasto" value={formatCurrency(totalSpend)} loading={loading} />
          ) : (
            <DiagMetric
              label="Taxa Conv."
              value={formatPercent(conversionRate)}
              sub={`${totalClicks} cliques → ${totalConversions} vendas`}
              loading={loading}
            />
          )}
          <DiagMetric label="Impressoes" value={formatCompact(totalImpressions)} loading={loading} />
          <DiagMetric label="Hook Rate" value={hookRate != null ? formatPercent(hookRate) : '-'} sub={hookRate != null ? 'Cliques / Impr.' : 'Sem impressoes'} loading={loading} />
        </div>

        {/* Trend charts */}
        {!loading && daily.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Hook Rate por Dia
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={35} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={((v: number, name: string) => [`${v.toFixed(2)}%`, name]) as never}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="hookRate" name="Hook Rate" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">Cliques vs {convLabel} por Dia</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" fontSize={10} tickLine={false} axisLine={false} width={35} />
                  <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} axisLine={false} width={25} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="clicks" name="Cliques" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} opacity={0.7} />
                  <Bar yAxisId="right" dataKey="conversions" name={convLabel} fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Daily breakdown table */}
        <div className="flex-1 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-right px-3 py-2 font-medium">Impr.</th>
                <th className="text-right px-3 py-2 font-medium">Cliques</th>
                <th className="text-right px-3 py-2 font-medium">CTR</th>
                <th className="text-right px-3 py-2 font-medium">CPC</th>
                <th className="text-right px-3 py-2 font-medium">CPM</th>
                <th className="text-right px-3 py-2 font-medium">Gasto</th>
                <th className="text-right px-3 py-2 font-medium">{isCaptura ? 'Leads' : 'Conv.'}</th>
                <th className="text-right px-3 py-2 font-medium">Freq.</th>
                <th className="text-center px-3 py-2 font-medium">Tend.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 7 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : daily.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-muted-foreground">
                    Nenhum dado diario encontrado.
                  </td>
                </tr>
              ) : (
                daily.map((d, idx) => {
                  const dayCtr = d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0;
                  const prevDay = idx > 0 ? daily[idx - 1] : null;
                  const prevCtr = prevDay && prevDay.impressions > 0
                    ? (prevDay.clicks / prevDay.impressions) * 100
                    : dayCtr;
                  const dayTrend = dayCtr - prevCtr;

                  return (
                    <tr key={d.date} className="border-b hover:bg-muted/50">
                      <td className="px-3 py-2 font-mono text-xs">{d.date}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatCompact(d.impressions)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatNumber(d.clicks)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatPercent(dayCtr)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatCurrency(d.clicks > 0 ? Number(d.spend) / d.clicks : null)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatCurrency(d.impressions > 0 ? (Number(d.spend) / d.impressions) * 1000 : null)}</td>
                      <td className="text-right px-3 py-2 font-mono">{formatCurrency(Number(d.spend))}</td>
                      <td className="text-right px-3 py-2 font-mono">{d.conversions}</td>
                      <td className={`text-right px-3 py-2 font-mono ${Number(d.frequency) >= DEFAULT_SETTINGS.frequency_kill ? 'text-red-600 font-bold' : Number(d.frequency) >= DEFAULT_SETTINGS.frequency_warn ? 'text-amber-600' : ''}`}>{Number(d.frequency) > 0 ? Number(d.frequency).toFixed(1) : '-'}</td>
                      <td className="text-center px-3 py-2">
                        <TrendIcon value={dayTrend} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
  );
}

function DiagMetric({
  label,
  value,
  sub,
  loading,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-card p-3 ${highlight ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <div className={`text-lg font-bold ${highlight ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>{value}</div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
