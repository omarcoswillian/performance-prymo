'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { NavTabs } from '@/components/creatives/nav-tabs';
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
import { RefreshCw, Loader2, ImageIcon, MousePointerClick, ShoppingCart, Target, PointerIcon, Percent, Trophy } from 'lucide-react';
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

export default function CommandPage() {
  const router = useRouter();
  const { selectedAccount, dateStart, dateEnd } = useAccount();
  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [ctrBenchmark, setCtrBenchmark] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [overrides] = useState<Record<string, string>>({});

  // Summary totals
  const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = creatives.reduce((s, c) => s + c.clicks, 0);
  const totalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalCompras = creatives.reduce((s, c) => s + c.compras, 0);
  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
  const avgCpa = totalCompras > 0 ? totalSpend / totalCompras : null;
  const taxaConversao = totalClicks > 0 ? (totalCompras / totalClicks) * 100 : 0;

  const fetchData = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=command`
      );
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd, overrides]);

  const handleSync = useCallback(async () => {
    if (!selectedAccount || syncing) return;
    setSyncing(true);
    try {
      await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_account_id: selectedAccount }),
      });
      await fetchData();
    } finally {
      setSyncing(false);
    }
  }, [selectedAccount, syncing, fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const countByStatus = (s: string) => creatives.filter(c => c.status === s).length;

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

  return (
    <>
      <NavTabs />
      <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Painel de Comando</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">{countByStatus('ESCALAR')} escalar</span>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700">{countByStatus('VARIAR')} variar</span>
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700">{countByStatus('MATAR')} matar</span>
            </div>
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="h-8">
              {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Sync
            </Button>
          </div>
        </div>

        {/* 5 Metric cards */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <MetricBox icon={MousePointerClick} label="CTR" value={formatPercent(totalCtr)} sub={`Benchmark: ${formatPercent(ctrBenchmark)}`} loading={loading} />
          <MetricBox icon={PointerIcon} label="Cliques" value={formatNumber(totalClicks)} loading={loading} />
          <MetricBox icon={ShoppingCart} label="Compras" value={formatNumber(totalCompras)} loading={loading} />
          <MetricBox icon={Percent} label="Taxa Conv." value={formatPercent(taxaConversao)} sub={`${totalClicks} cliques → ${totalCompras} conv.`} loading={loading} />
          <MetricBox icon={Target} label="CPA" value={formatCurrency(avgCpa)} sub={`Alvo: ${formatCurrency(DEFAULT_SETTINGS.cpa_target)}`} loading={loading} />
        </div>

        {/* Trend charts */}
        {!loading && dailyTotals.length > 0 && (() => {
          const chartData = dailyTotals.map(d => ({
            ...d,
            label: fmtDate(parseISO(d.date), 'dd/MM', { locale: ptBR }),
            // Keep CPA as number or undefined (recharts skips undefined points)
            cpa: d.cpa != null ? d.cpa : undefined,
          }));
          const hasCpa = chartData.some(d => d.cpa !== undefined);

          return (
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">Compras por Dia</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      formatter={(v: number) => [v, 'Compras']}
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
                        formatter={(v: number, name: string) => {
                          if (name === 'CPA') return [formatCurrency(v), 'CPA'];
                          return [v, name];
                        }}
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

        {/* Table + Ranking side by side */}
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Table - main area */}
          <div className="flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Criativo</TableHead>
                  <TableHead className="text-right w-20">CTR</TableHead>
                  <TableHead className="text-right w-20">Compras</TableHead>
                  <TableHead className="text-right w-24">CPA</TableHead>
                  <TableHead className="text-right w-20">Freq.</TableHead>
                  <TableHead className="text-center w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : creatives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
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
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.campaign_name}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">{formatPercent(c.ctr)}</TableCell>
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

          {/* Ranking sidebar - Top 10 */}
          {!loading && topCreatives.length > 0 && (
            <div className="w-[380px] shrink-0 rounded-lg border bg-card p-3 overflow-auto">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-3">
                <Trophy className="h-3.5 w-3.5" />
                Top Criativos
              </div>
              <div className="flex flex-col gap-2">
                {topCreatives.map((c, idx) => (
                  <div
                    key={c.ad_id}
                    className="flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}
                  >
                    <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">#{idx + 1}</span>
                    {c.thumbnail_url ? (
                      <Image src={c.thumbnail_url} alt="" width={28} height={28} className="rounded object-cover shrink-0" unoptimized />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded bg-muted shrink-0">
                        <ImageIcon className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{c.name}</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span>{c.compras} compras</span>
                        <span>&middot;</span>
                        <span>{formatCurrency(c.cpa)}</span>
                      </div>
                    </div>
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 dark:text-blue-400 shrink-0 uppercase tracking-wider">
                      Top
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MetricBox({
  icon: Icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  loading: boolean;
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
        <div className="text-xl font-bold">{value}</div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
