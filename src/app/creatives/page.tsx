'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AdThumbnail } from '@/components/creatives/ad-thumbnail';
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
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  Filter,
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
import { useCommandData } from '@/lib/hooks/use-command-data';
import type { CreativeWithDecision, DecisionStatus } from '@/lib/decision-engine';

interface PeriodTotals {
  impressions: number;
  clicks: number;
  compras: number;
  spend: number;
  ctr: number;
  cpa: number | null;
  taxaConversao: number;
}

function computeTotals(creatives: Pick<CreativeWithDecision, 'impressions' | 'clicks' | 'compras' | 'spend'>[]): PeriodTotals {
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
  if (invertBetter) return isUp ? 'down' : 'up';
  return isUp ? 'up' : 'down';
}

const ALL_STATUSES: DecisionStatus[] = ['ESCALAR', 'APRENDENDO', 'VARIAR', 'MATAR', 'FORÇADO'];

type SortColumn = 'score' | 'ctr' | 'clicks' | 'compras' | 'cpa' | 'roas' | 'frequency' | 'status' | 'spend';
type SortDir = 'asc' | 'desc';

const SORT_KEY = 'mc_sort_pref';

function loadSortPref(): { col: SortColumn; dir: SortDir } {
  try {
    const stored = localStorage.getItem(SORT_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { col: 'score', dir: 'desc' };
}

export default function CommandPage() {
  const router = useRouter();
  const { selectedAccount, dateEnd, prevDateStart, prevDateEnd } = useAccount();
  const { creatives, dailyTotals, settings, ctrBenchmark, loading, syncing, error, triggerSync } = useCommandData();

  // Sorting
  const [sortCol, setSortCol] = useState<SortColumn>(() => loadSortPref().col);
  const [sortDir, setSortDir] = useState<SortDir>(() => loadSortPref().dir);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Filters
  const [statusFilter, setStatusFilter] = useState<Set<DecisionStatus>>(new Set());
  const [campaignFilter, setCampaignFilter] = useState('');
  const [formatFilter, setFormatFilter] = useState('');

  // Previous period
  const [prevTotals, setPrevTotals] = useState<PeriodTotals | null>(null);

  const fetchPrevPeriod = useCallback(async () => {
    if (!selectedAccount || !prevDateStart || !prevDateEnd) return;
    try {
      const res = await fetch(
        `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${prevDateStart}&date_end=${prevDateEnd}&type=command`
      );
      if (res.ok) {
        const data = await res.json();
        setPrevTotals(computeTotals(data.creatives || []));
      }
    } catch {}
  }, [selectedAccount, prevDateStart, prevDateEnd]);

  useEffect(() => {
    setPrevTotals(null);
    fetchPrevPeriod();
  }, [fetchPrevPeriod]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Persist sort
  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, JSON.stringify({ col: sortCol, dir: sortDir })); } catch {}
  }, [sortCol, sortDir]);

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  function getTypeLabels(c: CreativeWithDecision) {
    if (c.campaign_type === 'CAPTURA') {
      return { convLabel: 'leads', costLabel: 'CPL', costTarget: settings.cpl_target };
    }
    return { convLabel: 'vendas', costLabel: 'CPA', costTarget: settings.cpa_target };
  }

  // Derived data
  const uniqueCampaigns = useMemo(() => [...new Set(creatives.map(c => c.campaign_name))].sort(), [creatives]);
  const uniqueFormats = useMemo(() => [...new Set(creatives.map(c => c.format).filter(Boolean))].sort(), [creatives]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of ALL_STATUSES) counts[s] = 0;
    for (const c of creatives) counts[c.status] = (counts[c.status] || 0) + 1;
    return counts;
  }, [creatives]);

  const filteredCreatives = useMemo(() => {
    let result = [...creatives];

    // Search
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.campaign_name.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter.size > 0) {
      result = result.filter(c => statusFilter.has(c.status));
    }

    // Campaign filter
    if (campaignFilter) {
      result = result.filter(c => c.campaign_name === campaignFilter);
    }

    // Format filter
    if (formatFilter) {
      result = result.filter(c => c.format === formatFilter);
    }

    // Sort
    const statusOrder: Record<string, number> = { ESCALAR: 0, APRENDENDO: 1, VARIAR: 2, 'FORÇADO': 3, MATAR: 4 };
    result.sort((a, b) => {
      let valA: number, valB: number;
      switch (sortCol) {
        case 'score': valA = a.score ?? 0; valB = b.score ?? 0; break;
        case 'ctr': valA = a.ctr; valB = b.ctr; break;
        case 'clicks': valA = a.clicks; valB = b.clicks; break;
        case 'compras': valA = a.compras; valB = b.compras; break;
        case 'cpa': valA = a.cpa ?? 999999; valB = b.cpa ?? 999999; break;
        case 'roas': valA = a.roas ?? -1; valB = b.roas ?? -1; break;
        case 'frequency': valA = a.frequency ?? 0; valB = b.frequency ?? 0; break;
        case 'spend': valA = a.spend; valB = b.spend; break;
        case 'status': valA = statusOrder[a.status] ?? 5; valB = statusOrder[b.status] ?? 5; break;
        default: valA = 0; valB = 0;
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [creatives, debouncedSearch, statusFilter, campaignFilter, formatFilter, sortCol, sortDir]);

  const hasFilters = debouncedSearch || statusFilter.size > 0 || campaignFilter || formatFilter;

  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setStatusFilter(new Set());
    setCampaignFilter('');
    setFormatFilter('');
  };

  const currentTotals = computeTotals(creatives);

  // Trend directions
  const ctrTrend = computeTrend(currentTotals.ctr, prevTotals?.ctr ?? null);
  const comprasTrend = computeTrend(currentTotals.compras, prevTotals?.compras ?? null);
  const convTrend = computeTrend(currentTotals.taxaConversao, prevTotals?.taxaConversao ?? null);
  const cpaTrend = computeTrend(currentTotals.cpa, prevTotals?.cpa ?? null, true);

  // Detect predominant campaign type
  const capturaCount = creatives.filter(c => c.campaign_type === 'CAPTURA').length;
  const vendasCount = creatives.length - capturaCount;
  const hasMixed = capturaCount > 0 && vendasCount > 0;

  // Ranking: Top 10
  const topCreatives = creatives
    .filter(c => c.status !== 'MATAR')
    .filter(c => c.compras > 0)
    .sort((a, b) => {
      const costA = a.cpa ?? Infinity;
      const costB = b.cpa ?? Infinity;
      if (costA !== costB) return costA - costB;
      return b.compras - a.compras;
    })
    .slice(0, 10);

  // Worst creatives
  const worstCreatives = creatives
    .filter(c => {
      if (c.status === 'MATAR') return true;
      if (c.spend >= settings.min_spend && c.compras === 0) return true;
      const { costTarget } = getTypeLabels(c);
      if (c.cpa !== null && c.cpa > costTarget * settings.cost_kill_multiplier) return true;
      return false;
    })
    .sort((a, b) => {
      const wasteA = a.compras === 0 ? a.spend : 0;
      const wasteB = b.compras === 0 ? b.spend : 0;
      if (wasteB !== wasteA) return wasteB - wasteA;
      const { costTarget: targetA } = getTypeLabels(a);
      const { costTarget: targetB } = getTypeLabels(b);
      const ratioA = a.cpa !== null ? a.cpa / targetA : 0;
      const ratioB = b.cpa !== null ? b.cpa / targetB : 0;
      return ratioB - ratioA;
    })
    .slice(0, 5);

  const getWorstReason = (c: CreativeWithDecision): string => {
    const { convLabel, costLabel, costTarget } = getTypeLabels(c);
    if (c.compras === 0 && c.spend >= settings.min_spend) return `R$${c.spend.toFixed(2)} gasto sem ${convLabel}`;
    if (c.cpa !== null && c.cpa > costTarget * settings.cost_kill_multiplier) return `${costLabel} ${formatCurrency(c.cpa)} > alvo`;
    return c.status_reason;
  };

  // Labels for metric cards
  const primaryCostLabel = capturaCount > vendasCount ? 'CPL' : 'CPA';
  const primaryCostTarget = capturaCount > vendasCount ? settings.cpl_target : settings.cpa_target;
  const primaryConvLabel = capturaCount > vendasCount ? 'Leads' : 'Vendas';
  const PrimaryConvIcon = capturaCount > vendasCount ? Users : ShoppingCart;

  const toggleStatus = (s: DecisionStatus) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  return (
      <div className="flex flex-1 flex-col px-6 py-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Painel de Comando</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">{statusCounts['ESCALAR'] || 0} escalar</span>
              <span className="rounded bg-blue-500/15 px-2 py-0.5 text-blue-700 dark:text-blue-400">{statusCounts['APRENDENDO'] || 0} aprend.</span>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">{statusCounts['VARIAR'] || 0} variar</span>
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-400">{statusCounts['MATAR'] || 0} matar</span>
            </div>
            <Button onClick={triggerSync} disabled={syncing} variant="outline" size="sm" className="h-8">
              {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Sync
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Campaign type indicator */}
        {!loading && hasMixed && (
          <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-700 dark:text-blue-400">{vendasCount} vendas</span>
            <span className="rounded bg-purple-500/10 px-2 py-0.5 text-purple-700 dark:text-purple-400">{capturaCount} captura</span>
          </div>
        )}

        {/* 4 Metric cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <MetricBox icon={MousePointerClick} label="CTR" value={formatPercent(currentTotals.ctr)} sub={`Benchmark: ${formatPercent(ctrBenchmark)}`} loading={loading} trend={ctrTrend} />
          <MetricBox icon={PrimaryConvIcon} label={primaryConvLabel} value={formatNumber(currentTotals.compras)} loading={loading} trend={comprasTrend} />
          <MetricBox icon={Percent} label="Taxa Conv." value={formatPercent(currentTotals.taxaConversao)} sub={`${currentTotals.clicks} cliques → ${currentTotals.compras} conv.`} loading={loading} trend={convTrend} />
          <MetricBox icon={Target} label={primaryCostLabel} value={formatCurrency(currentTotals.cpa)} sub={`Alvo: ${formatCurrency(primaryCostTarget)}`} loading={loading} trend={cpaTrend} />
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
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : topCreatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Nenhum criativo com conversoes no periodo.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {topCreatives.map((c, idx) => {
                    const { convLabel, costLabel } = getTypeLabels(c);
                    return (
                      <div key={c.ad_id} className="flex items-center gap-2.5 rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}>
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} />
                        <div className="min-w-0 flex-1">
                          <a href={selectedAccount ? getMetaAdsUrl(selectedAccount, c.ad_id) : '#'} target="_blank" rel="noopener noreferrer" className="text-xs font-medium truncate block text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            {c.name}
                            <ExternalLink className="inline-block ml-1 h-2.5 w-2.5 opacity-50" />
                          </a>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span>{c.compras} {convLabel}</span>
                            <span>&middot;</span>
                            <span>{costLabel} {formatCurrency(c.cpa)}</span>
                            <span>&middot;</span>
                            <span className="font-medium">Score {c.score}</span>
                          </div>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                    );
                  })}
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
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : worstCreatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">Nenhum criativo com performance critica.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {worstCreatives.map((c, idx) => (
                    <div key={c.ad_id} className="flex items-center gap-2.5 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2 cursor-pointer hover:bg-red-500/10 transition-colors" onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}>
                      <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                      <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} />
                      <div className="min-w-0 flex-1">
                        <a href={selectedAccount ? getMetaAdsUrl(selectedAccount, c.ad_id) : '#'} target="_blank" rel="noopener noreferrer" className="text-xs font-medium truncate block text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.name}
                          <ExternalLink className="inline-block ml-1 h-2.5 w-2.5 opacity-50" />
                        </a>
                        <div className="text-[10px] text-red-600 dark:text-red-400">{getWorstReason(c)}</div>
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
                <div className="text-xs font-medium text-muted-foreground mb-2">Conversoes por Dia</div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={30} />
                    <Tooltip formatter={((v: number) => [v, 'Conv.']) as never} labelFormatter={(l) => `Dia ${l}`} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="conversions" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">{primaryCostLabel} por Dia</div>
                {hasCpa ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                      <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `R$${v}`} domain={['auto', 'auto']} />
                      <Tooltip formatter={((v: number) => [formatCurrency(v), primaryCostLabel]) as never} labelFormatter={(l) => `Dia ${l}`} contentStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="cpa" name={primaryCostLabel} stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">Sem {primaryCostLabel} calculavel</div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Search + Filters */}
        {!loading && creatives.length > 0 && (
          <div className="mb-3 space-y-2">
            {/* Search + dropdowns row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nome ou campanha..."
                  className="w-full rounded-md border bg-background pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setDebouncedSearch(''); }} className="absolute right-2 top-2">
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              <select
                value={campaignFilter}
                onChange={e => setCampaignFilter(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Todas campanhas</option>
                {uniqueCampaigns.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <select
                value={formatFilter}
                onChange={e => setFormatFilter(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Todos formatos</option>
                {uniqueFormats.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>

              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <X className="h-3 w-3" /> Limpar
                </button>
              )}
            </div>

            {/* Status chips */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {ALL_STATUSES.map(s => {
                const count = statusCounts[s] || 0;
                const active = statusFilter.has(s);
                const colors: Record<string, string> = {
                  ESCALAR: active ? 'bg-emerald-500 text-white' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                  APRENDENDO: active ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
                  VARIAR: active ? 'bg-amber-500 text-white' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                  MATAR: active ? 'bg-red-500 text-white' : 'bg-red-500/15 text-red-700 dark:text-red-400',
                  'FORÇADO': active ? 'bg-purple-500 text-white' : 'bg-purple-500/15 text-purple-700 dark:text-purple-400',
                };
                return (
                  <button
                    key={s}
                    onClick={() => toggleStatus(s)}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors ${colors[s]}`}
                  >
                    {s} ({count})
                  </button>
                );
              })}
            </div>

            <div className="text-[10px] text-muted-foreground">
              Mostrando {filteredCreatives.length} de {creatives.length} criativos
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Criativo</TableHead>
                {hasMixed && <TableHead className="text-center w-12">Tipo</TableHead>}
                <SortableHead label="Score" col="score" current={sortCol} dir={sortDir} onSort={handleSort} className="w-16" />
                <SortableHead label="CTR" col="ctr" current={sortCol} dir={sortDir} onSort={handleSort} className="w-20" />
                <SortableHead label="Cliques" col="clicks" current={sortCol} dir={sortDir} onSort={handleSort} className="w-20" />
                <SortableHead label="Conv." col="compras" current={sortCol} dir={sortDir} onSort={handleSort} className="w-20" />
                <SortableHead label="Custo/Conv." col="cpa" current={sortCol} dir={sortDir} onSort={handleSort} className="w-24" />
                <SortableHead label="ROAS" col="roas" current={sortCol} dir={sortDir} onSort={handleSort} className="w-20" />
                <SortableHead label="Freq." col="frequency" current={sortCol} dir={sortDir} onSort={handleSort} className="w-20" />
                <SortableHead label="Status" col="status" current={sortCol} dir={sortDir} onSort={handleSort} className="w-28" align="center" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: hasMixed ? 11 : 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredCreatives.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={hasMixed ? 11 : 10} className="text-center py-12 text-muted-foreground">
                    {hasFilters ? 'Nenhum criativo corresponde aos filtros.' : 'Nenhum criativo ativo com dados no periodo.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCreatives.map((c) => {
                  const { costLabel } = getTypeLabels(c);
                  return (
                    <TableRow key={c.ad_id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/creatives/diagnostico/${c.ad_id}`)}>
                      <TableCell>
                        <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[300px]">
                          <a href={selectedAccount ? getMetaAdsUrl(selectedAccount, c.ad_id) : '#'} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            {c.name}
                            <ExternalLink className="inline-block ml-1 h-3 w-3 opacity-50" />
                          </a>
                          <div className="text-xs text-muted-foreground truncate">{c.campaign_name}</div>
                        </div>
                      </TableCell>
                      {hasMixed && (
                        <TableCell className="text-center">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.campaign_type === 'CAPTURA' ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400' : 'bg-blue-500/10 text-blue-700 dark:text-blue-400'}`}>
                            {c.campaign_type === 'CAPTURA' ? 'C' : 'V'}
                          </span>
                        </TableCell>
                      )}
                      <TableCell className="text-right text-sm">
                        <span className={`inline-flex items-center justify-center h-6 w-8 rounded text-xs font-bold ${
                          c.score >= 70 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' :
                          c.score >= 40 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' :
                          'bg-red-500/15 text-red-700 dark:text-red-400'
                        }`}>
                          {c.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">{formatPercent(c.ctr)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{formatNumber(c.clicks)}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{c.compras}</TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        <span title={costLabel}>{formatCurrency(c.cpa)}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono">{c.roas != null ? `${c.roas.toFixed(1)}x` : '-'}</TableCell>
                      <TableCell className={`text-right text-sm font-mono ${c.frequency != null && c.frequency >= settings.frequency_kill ? 'text-red-600 font-bold' : c.frequency != null && c.frequency >= settings.frequency_warn ? 'text-amber-600' : ''}`}>{c.frequency != null && c.frequency > 0 ? c.frequency.toFixed(1) : '-'}</TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={c.status} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
  );
}

function SortableHead({ label, col, current, dir, onSort, className, align }: {
  label: string; col: SortColumn; current: SortColumn; dir: SortDir;
  onSort: (col: SortColumn) => void; className?: string; align?: 'center' | 'right';
}) {
  const isActive = current === col;
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 text-xs font-medium ${align === 'center' ? 'mx-auto' : 'ml-auto'} hover:text-foreground transition-colors`}
      >
        {label}
        {isActive ? (
          dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );
}

function TrendArrow({ trend }: { trend: TrendDir }) {
  if (trend === 'up') return <TrendingUp className="h-3 w-3 text-emerald-600" />;
  if (trend === 'down') return <TrendingDown className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function MetricBox({
  icon: Icon, label, value, sub, loading, trend,
}: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string;
  sub?: string; loading: boolean; trend?: TrendDir;
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
          {trend && <span title="Comparado ao periodo anterior"><TrendArrow trend={trend} /></span>}
        </div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
