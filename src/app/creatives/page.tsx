'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/creatives/status-badge';
import { useAccount } from '@/components/creatives/account-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Loader2,
  ImageIcon,
  MousePointerClick,
  ShoppingCart,
  Target,
  Percent,
  Trophy,
  AlertTriangle,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';
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
} from 'recharts';
import { format as fmtDate, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  applyDecisions,
  DEFAULT_SETTINGS,
  type CreativeWithDecision,
  type CreativeMetrics,
} from '@/lib/decision-engine';

interface DailyTotal {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
  ctr: number;
}

interface PeriodTotals {
  impressions: number;
  clicks: number;
  compras: number;
  spend: number;
  ctr: number;
  cpa: number | null;
  taxaConversao: number;
}

function computeTotals(creatives: CreativeMetrics[]): PeriodTotals {
  const impressions = creatives.reduce((s, c) => s + c.impressions, 0);
  const clicks = creatives.reduce((s, c) => s + c.clicks, 0);
  const compras = creatives.reduce((s, c) => s + c.compras, 0);
  const spend = creatives.reduce((s, c) => s + c.spend, 0);
  return {
    impressions,
    clicks,
    compras,
    spend,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpa: compras > 0 ? spend / compras : null,
    taxaConversao: clicks > 0 ? (compras / clicks) * 100 : 0,
  };
}

function getMetaAdsUrl(adAccountId: string, adId: string): string {
  const cleanAccountId = adAccountId.replace(/^act_/, '');
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${cleanAccountId}&selected_ad_ids=${adId}`;
}

type TrendDir = 'up' | 'down' | 'stable';

function computeTrend(current: number | null, previous: number | null, invertBetter?: boolean): TrendDir {
  if (current === null || previous === null || previous === 0) return 'stable';
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(delta) < 3) return 'stable';
  const isUp = delta > 0;
  // For CPA, "up" is bad, so we invert
  if (invertBetter) return isUp ? 'down' : 'up';
  return isUp ? 'up' : 'down';
}

export default function CommandPage() {
  const router = useRouter();
  const { selectedAccount, dateStart, dateEnd, prevDateStart, prevDateEnd } = useAccount();
  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [ctrBenchmark, setCtrBenchmark] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [overrides] = useState<Record<string, string>>({});

  // Current period totals (from decision-applied creatives)
  const currentTotals = computeTotals(creatives);

  // Previous period totals
  const [prevTotals, setPrevTotals] = useState<PeriodTotals | null>(null);

  const fetchData = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      // Fetch current + previous period in parallel
      const [res, prevRes] = await Promise.all([
        fetch(
          `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=command`
        ),
        fetch(
          `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${prevDateStart}&date_end=${prevDateEnd}&type=command`
        ),
      ]);

      if (res.ok) {
        const data = await res.json();
        const raw: CreativeMetrics[] = data.creatives || [];
        const withDecisions = applyDecisions(raw, DEFAULT_SETTINGS, overrides);
        setCreatives(withDecisions);
        setDailyTotals(data.daily_totals || []);
        setCtrBenchmark(
          raw.length > 0
            ? (raw.reduce((s, c) => s + c.clicks, 0) / raw.reduce((s, c) => s + c.impressions, 0)) * 100
            : 0
        );
      }

      if (prevRes.ok) {
        const prevData = await prevRes.json();
        const prevRaw: CreativeMetrics[] = prevData.creatives || [];
        setPrevTotals(computeTotals(prevRaw));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd, prevDateStart, prevDateEnd, overrides]);

  const handleSync = useCallback(async () => {
    if (!selectedAccount || syncing) return;
    setSyncing(true);
    try {
      await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_account_id: selectedAccount,
        }),
      });
      await fetchData();
    } finally {
      setSyncing(false);
    }
  }, [selectedAccount, syncing, fetchData]);

  useEffect(() => {
    // Clear stale data immediately when account/period changes
    setCreatives([]);
    setDailyTotals([]);
    setPrevTotals(null);
    fetchData();
  }, [fetchData]);

  const countByStatus = (s: string) => creatives.filter(c => c.status === s).length;

  // Trend directions
  const ctrTrend = computeTrend(currentTotals.ctr, prevTotals?.ctr ?? null);
  const comprasTrend = computeTrend(currentTotals.compras, prevTotals?.compras ?? null);
  const convTrend = computeTrend(currentTotals.taxaConversao, prevTotals?.taxaConversao ?? null);
  const cpaTrend = computeTrend(currentTotals.cpa, prevTotals?.cpa ?? null, true);

  // Ranking: Top 10 excluding MATAR, sorted by Compras desc > CPA asc > CTR desc
  const topCreatives = creatives
    .filter(c => c.status !== 'MATAR')
    .filter(c => c.compras > 0)
    .sort((a, b) => {
      if (b.compras !== a.compras) return b.compras - a.compras;
      const cpaA = a.cpa ?? Infinity;
      const cpaB = b.cpa ?? Infinity;
      if (cpaA !== cpaB) return cpaA - cpaB;
      return b.ctr - a.ctr;
    })
    .slice(0, 10);

  // Worst creatives: status MATAR, OR spent >= min_spend with 0 purchases, OR CPA > 1.3x target
  const worstCreatives = creatives
    .filter(c =>
      c.status === 'MATAR' ||
      (c.spend >= DEFAULT_SETTINGS.min_spend && c.compras === 0) ||
      (c.cpa !== null && c.cpa > DEFAULT_SETTINGS.cpa_target * DEFAULT_SETTINGS.cpa_kill_multiplier)
    )
    .sort((a, b) => {
      const wasteA = a.compras === 0 ? a.spend : 0;
      const wasteB = b.compras === 0 ? b.spend : 0;
      if (wasteB !== wasteA) return wasteB - wasteA;
      const ratioA = a.cpa !== null ? a.cpa / DEFAULT_SETTINGS.cpa_target : 0;
      const ratioB = b.cpa !== null ? b.cpa / DEFAULT_SETTINGS.cpa_target : 0;
      if (ratioB !== ratioA) return ratioB - ratioA;
      return a.ctr - b.ctr;
    })
    .slice(0, 5);

  const getWorstReason = (c: CreativeWithDecision): string => {
    if (c.compras === 0 && c.spend >= DEFAULT_SETTINGS.min_spend) return `R$${c.spend.toFixed(2)} gasto sem vendas`;
    if (c.cpa !== null && c.cpa > DEFAULT_SETTINGS.cpa_target * DEFAULT_SETTINGS.cpa_kill_multiplier) return `CPA ${formatCurrency(c.cpa)} > alvo`;
    return `CTR ${formatPercent(c.ctr)} abaixo`;
  };

  return (
      <div className="flex flex-1 flex-col px-6 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Painel de Comando</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">{countByStatus('ESCALAR')} escalar</span>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">{countByStatus('VARIAR')} variar</span>
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-400">{countByStatus('MATAR')} matar</span>
            </div>
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="h-8">
              {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Sync
            </Button>
          </div>
        </div>

        {/* 4 Metric cards with trend arrows (Cliques movido para tabela) */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <MetricBox icon={MousePointerClick} label="CTR" value={formatPercent(currentTotals.ctr)} sub={`Benchmark: ${formatPercent(ctrBenchmark)}`} loading={loading} trend={ctrTrend} />
          <MetricBox icon={ShoppingCart} label="Vendas" value={formatNumber(currentTotals.compras)} loading={loading} trend={comprasTrend} />
          <MetricBox icon={Percent} label="Taxa Conv." value={formatPercent(currentTotals.taxaConversao)} sub={`${currentTotals.clicks} cliques → ${currentTotals.compras} vendas`} loading={loading} trend={convTrend} />
          <MetricBox icon={Target} label="CPA" value={formatCurrency(currentTotals.cpa)} sub={`Alvo: ${formatCurrency(DEFAULT_SETTINGS.cpa_target)}`} loading={loading} trend={cpaTrend} />
        </div>

        {/* Top vs Piores — side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Top Criativos */}
          <div className="rounded-lg border border-emerald-500/20 bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/10">
              <Trophy className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">Top Criativos</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{topCreatives.length} criativos</span>
            </div>
            <div className="px-4 py-3">
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : topCreatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum criativo com vendas no periodo.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {topCreatives.map((c, idx) => (
                    <div
                      key={c.ad_id}
                      className="flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}
                    >
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                      {c.thumbnail_url ? (
                        <Image src={c.thumbnail_url} alt="" width={32} height={32} className="rounded object-cover shrink-0" unoptimized />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted shrink-0">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <a
                          href={selectedAccount ? getMetaAdsUrl(selectedAccount, c.ad_id) : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium truncate block text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir no Meta Ads Manager"
                        >
                          {c.name}
                          <ExternalLink className="inline-block ml-1 h-2.5 w-2.5 opacity-50" />
                        </a>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span>{c.compras} vendas</span>
                          <span>&middot;</span>
                          <span>{formatCurrency(c.cpa)}</span>
                          <span>&middot;</span>
                          <span>CTR {formatPercent(c.ctr)}</span>
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Piores Criativos */}
          <div className="rounded-lg border border-red-500/20 bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Piores Criativos</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{worstCreatives.length} criativos</span>
            </div>
            <div className="px-4 py-3">
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : worstCreatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum criativo com performance critica.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {worstCreatives.map((c, idx) => (
                    <div
                      key={c.ad_id}
                      className="flex items-center gap-2.5 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2 cursor-pointer hover:bg-red-500/10 transition-colors"
                      onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}
                    >
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                      {c.thumbnail_url ? (
                        <Image src={c.thumbnail_url} alt="" width={32} height={32} className="rounded object-cover shrink-0" unoptimized />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted shrink-0">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <a
                          href={selectedAccount ? getMetaAdsUrl(selectedAccount, c.ad_id) : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium truncate block text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir no Meta Ads Manager"
                        >
                          {c.name}
                          <ExternalLink className="inline-block ml-1 h-2.5 w-2.5 opacity-50" />
                        </a>
                        <div className="text-[10px] text-red-600 dark:text-red-400">
                          {getWorstReason(c)}
                        </div>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trend charts */}
        {!loading && dailyTotals.length > 0 && (() => {
          const chartData = dailyTotals.map(d => ({
            ...d,
            label: fmtDate(parseISO(d.date), 'dd/MM', { locale: ptBR }),
            cpa: d.cpa != null ? d.cpa : undefined,
          }));
          const hasCpa = chartData.some(d => d.cpa !== undefined);

          return (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Vendas por Dia</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      formatter={((v: number) => [v, 'Vendas']) as never}
                      labelFormatter={(l) => `Dia ${l}`}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="conversions" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">CPA por Dia</div>
                {hasCpa ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                      <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `R$${v}`} domain={['auto', 'auto']} />
                      <Tooltip
                        formatter={((v: number, name: string) => {
                          if (name === 'CPA') return [formatCurrency(v), 'CPA'];
                          return [v, name];
                        }) as never}
                        labelFormatter={(l) => `Dia ${l}`}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="cpa" name="CPA" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
                    Sem CPA calculavel neste periodo
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Table — full width */}
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Criativo</TableHead>
                <TableHead className="text-right w-20">CTR</TableHead>
                <TableHead className="text-right w-20">Cliques</TableHead>
                <TableHead className="text-right w-20">Vendas</TableHead>
                <TableHead className="text-right w-24">CPA</TableHead>
                <TableHead className="text-right w-20">Freq.</TableHead>
                <TableHead className="text-center w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : creatives.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    Nenhum criativo ativo com dados no periodo.
                  </TableCell>
                </TableRow>
              ) : (
                creatives.map((c) => (
                  <TableRow
                    key={c.ad_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}
                  >
                    <TableCell>
                      {c.thumbnail_url ? (
                        <Image src={c.thumbnail_url} alt="" width={32} height={32} className="rounded object-cover" unoptimized />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[250px]">
                        <a
                          href={selectedAccount ? getMetaAdsUrl(selectedAccount, c.ad_id) : '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate block text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir no Meta Ads Manager"
                        >
                          {c.name}
                          <ExternalLink className="inline-block ml-1 h-3 w-3 opacity-50" />
                        </a>
                        <div className="text-xs text-muted-foreground truncate">{c.campaign_name}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatPercent(c.ctr)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatNumber(c.clicks)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{c.compras}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{formatCurrency(c.cpa)}</TableCell>
                    <TableCell className="text-right text-sm font-mono">{c.frequency > 0 ? c.frequency.toFixed(1) : '-'}</TableCell>
                    <TableCell className="text-center">
                      <StatusBadge status={c.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
  );
}

function TrendArrow({ trend }: { trend: TrendDir }) {
  if (trend === 'up') return <TrendingUp className="h-3 w-3 text-emerald-600" />;
  if (trend === 'down') return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function MetricBox({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
  trend?: TrendDir;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xl font-bold">{value}</span>
          {trend && (
            <span title="Comparado ao periodo anterior">
              <TrendArrow trend={trend} />
            </span>
          )}
        </div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
