'use client';

import { useAccount } from '@/components/creatives/account-context';
import {
  Globe,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  Loader2,
  Info,
  Trophy,
  TrendingDown,
  Users,
  Radio,
  ChevronDown,
  Percent,
  Link2,
} from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';

type PageStatus = 'OK' | 'ATENCAO' | 'TRAVAR TRAFEGO';

interface PageData {
  pagePath: string;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgEngagementTime: number;
  connectRate: number | null;
  status: PageStatus;
  statusReason: string;
  conversions: number;
  clicks: number;
  taxaConversao: number;
}

interface KPIs {
  taxaConversao: number;
  connectRate: number;
  totalSessions: number;
  totalClicks: number;
  totalConversions: number;
}

interface SummaryData {
  totalSessions: number;
  totalEngagedSessions: number;
  avgEngagementRate: number;
  avgEngagementTime: number;
}

interface RealtimeData {
  activeUsers: number;
  activePages: number;
  topPages: { pagePath: string; activeUsers: number }[];
}

const statusIcons: Record<PageStatus, React.ComponentType<{ className?: string }>> = {
  OK: CheckCircle,
  ATENCAO: AlertTriangle,
  'TRAVAR TRAFEGO': XCircle,
};

const statusColors: Record<PageStatus, string> = {
  OK: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  ATENCAO: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  'TRAVAR TRAFEGO': 'bg-red-500/15 text-red-700 dark:text-red-400',
};

type SortCriteria = 'taxaConversao' | 'connectRate';

function PageStatusBadge({ status, reason }: { status: PageStatus; reason: string }) {
  const Icon = statusIcons[status];
  return (
    <span
      title={reason}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold tracking-wide cursor-help ${statusColors[status]}`}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m${sec > 0 ? ` ${sec}s` : ''}`;
}

export default function PaginasPage() {
  const { selectedAccount, accounts, dateStart, dateEnd, periodLabel } = useAccount();
  const accountName = accounts.find(a => a.ad_account_id === selectedAccount)?.name || selectedAccount;

  const [pages, setPages] = useState<PageData[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('taxaConversao');
  const realtimeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;

    setLoading(true);
    setError(null);
    setNotConfigured(false);

    try {
      const qs = `ad_account_id=${selectedAccount}&start=${dateStart}&end=${dateEnd}`;
      const [pagesRes, summaryRes] = await Promise.all([
        fetch(`/api/ga4/pages?${qs}`),
        fetch(`/api/ga4/summary?${qs}`),
      ]);

      if (pagesRes.status === 404) {
        const body = await pagesRes.json();
        if (body.code === 'GA4_NOT_CONFIGURED') {
          setNotConfigured(true);
          return;
        }
      }

      if (!pagesRes.ok) {
        const body = await pagesRes.json();
        throw new Error(body.error || 'Erro ao buscar dados');
      }

      const pagesData = await pagesRes.json();
      setPages(pagesData.pages || []);
      setKpis(pagesData.kpis || null);

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.summary || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd]);

  const fetchRealtime = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`/api/ga4/realtime?ad_account_id=${selectedAccount}`);
      if (res.ok) {
        const data = await res.json();
        setRealtime(data);
      }
    } catch {
      // Silently fail for realtime — not critical
    }
  }, [selectedAccount]);

  // Clear all state when account changes to prevent stale/mixed data
  useEffect(() => {
    setPages([]);
    setKpis(null);
    setSummary(null);
    setRealtime(null);
    setError(null);
    setNotConfigured(false);
    fetchData();
  }, [fetchData]);

  // Realtime polling every 15s
  useEffect(() => {
    if (!selectedAccount || notConfigured) return;
    fetchRealtime();
    realtimeIntervalRef.current = setInterval(fetchRealtime, 15000);
    return () => {
      if (realtimeIntervalRef.current) clearInterval(realtimeIntervalRef.current);
    };
  }, [selectedAccount, notConfigured, fetchRealtime]);

  const handleSync = async () => {
    if (!selectedAccount || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/ga4/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_account_id: selectedAccount,
          start: dateStart,
          end: dateEnd,
        }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setSyncing(false);
    }
  };

  // Not configured state
  if (!loading && notConfigured) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <Globe className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">GA4 nao configurado</h2>
        <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
          Para ver dados reais de performance de paginas, configure o Property ID do Google Analytics 4 nas configuracoes da conta.
        </p>
        <Link
          href="/creatives/configuracoes"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Settings className="h-4 w-4" />
          Ir para Configuracoes
        </Link>
      </div>
    );
  }

  const statusCounts = {
    OK: pages.filter(p => p.status === 'OK').length,
    ATENCAO: pages.filter(p => p.status === 'ATENCAO').length,
    'TRAVAR TRAFEGO': pages.filter(p => p.status === 'TRAVAR TRAFEGO').length,
  };

  // Rankings
  const sortedPages = [...pages].sort((a, b) => {
    if (sortCriteria === 'taxaConversao') {
      if (b.taxaConversao !== a.taxaConversao) return b.taxaConversao - a.taxaConversao;
      return (b.connectRate ?? 0) - (a.connectRate ?? 0);
    }
    const crA = a.connectRate ?? 0;
    const crB = b.connectRate ?? 0;
    if (crB !== crA) return crB - crA;
    return b.taxaConversao - a.taxaConversao;
  });

  const bestPages = sortedPages.filter(p => p.sessions > 0).slice(0, 5);
  const worstPages = [...sortedPages].reverse().filter(p => p.sessions > 0).slice(0, 5);

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Performance de Paginas</h1>
          {accountName && (
            <span className="text-xs text-muted-foreground">{accountName}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Periodo: {periodLabel || `${dateStart} a ${dateEnd}`}
          </span>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar GA4'}
          </button>
          {!loading && pages.length > 0 && (
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">
                {statusCounts.OK} OK
              </span>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700">
                {statusCounts.ATENCAO} atencao
              </span>
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700">
                {statusCounts['TRAVAR TRAFEGO']} travar
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && pages.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
          <Globe className="h-8 w-8 mb-2" />
          <p className="text-sm">Nenhum dado de pagina encontrado para o periodo selecionado.</p>
          <button
            onClick={handleSync}
            className="mt-3 text-xs underline hover:text-foreground"
          >
            Sincronizar dados do GA4
          </button>
        </div>
      )}

      {/* Data */}
      {!loading && !error && pages.length > 0 && (
        <>
          {/* KPIs — Taxa de Conversão + Connect Rate */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Percent className="h-3.5 w-3.5" />
                Taxa de Conversao
              </div>
              <div className="text-2xl font-bold">
                {(kpis?.taxaConversao ?? 0).toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {kpis?.totalConversions ?? 0} vendas de {kpis?.totalClicks ?? 0} cliques
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Link2 className="h-3.5 w-3.5" />
                Connect Rate
              </div>
              <div className="text-2xl font-bold">
                {(kpis?.connectRate ?? 0).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {kpis?.totalSessions ?? 0} sessoes de {kpis?.totalClicks ?? 0} cliques
              </div>
            </div>
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1">Sessoes Totais</div>
              <div className="text-xl font-bold">
                {(summary?.totalSessions ?? pages.reduce((s, p) => s + p.sessions, 0)).toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">O trafego esta chegando?</div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1">Sessoes Engajadas</div>
              <div className="text-xl font-bold">
                {(summary?.totalEngagedSessions ?? pages.reduce((s, p) => s + p.engagedSessions, 0)).toLocaleString('pt-BR')}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Engage Rate: {((summary?.avgEngagementRate ?? 0) * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1">Tempo Medio Engajamento</div>
              <div className="text-xl font-bold">
                {formatDuration(summary?.avgEngagementTime ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Duracao media por sessao</div>
            </div>
          </div>

          {/* Realtime block */}
          {realtime && (
            <div className="rounded-lg border border-green-500/20 bg-card p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="h-4 w-4 text-green-500 animate-pulse" />
                <span className="text-sm font-medium">Tempo Real</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Atualiza a cada 15s</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-green-600" />
                  <div>
                    <div className="text-lg font-bold">{realtime.activeUsers}</div>
                    <div className="text-[10px] text-muted-foreground">Usuarios ativos agora</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-lg font-bold">{realtime.activePages}</div>
                    <div className="text-[10px] text-muted-foreground">Paginas ativas agora</div>
                  </div>
                </div>
              </div>
              {realtime.topPages.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Top paginas agora</div>
                  {realtime.topPages.slice(0, 5).map((p) => (
                    <div key={p.pagePath} className="flex items-center justify-between text-xs py-1 border-b border-muted last:border-0">
                      <span className="truncate max-w-[300px] font-mono" title={p.pagePath}>
                        {p.pagePath}
                      </span>
                      <span className="font-bold text-green-600 ml-2 shrink-0">
                        {p.activeUsers} {p.activeUsers === 1 ? 'usuario' : 'usuarios'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rankings: Melhores e Piores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Sort criteria selector */}
            <div className="md:col-span-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Ordenar por:</span>
              <button
                onClick={() => setSortCriteria(sortCriteria === 'taxaConversao' ? 'connectRate' : 'taxaConversao')}
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted/50"
              >
                {sortCriteria === 'taxaConversao' ? 'Taxa de Conversao' : 'Connect Rate'}
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            {/* Melhores Paginas */}
            <div className="rounded-lg border border-emerald-500/20 bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/10">
                <Trophy className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">Melhores Paginas</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{bestPages.length} paginas</span>
              </div>
              <div className="px-4 py-3">
                {bestPages.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Nenhuma pagina com dados no periodo.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {bestPages.map((p, idx) => (
                      <div
                        key={p.pagePath}
                        className="flex items-center gap-2.5 rounded-md border px-2.5 py-2"
                      >
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate" title={p.pagePath}>
                            {p.pagePath}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span>{p.sessions} sessoes</span>
                            <span>&middot;</span>
                            <span>{p.conversions} vendas</span>
                            <span>&middot;</span>
                            <span>Conv. {p.taxaConversao.toFixed(2)}%</span>
                            <span>&middot;</span>
                            <span>CR {p.connectRate !== null ? `${p.connectRate.toFixed(1)}%` : '—'}</span>
                          </div>
                        </div>
                        <PageStatusBadge status={p.status} reason={p.statusReason} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Piores Paginas */}
            <div className="rounded-lg border border-red-500/20 bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/10">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">Piores Paginas</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{worstPages.length} paginas</span>
              </div>
              <div className="px-4 py-3">
                {worstPages.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Nenhuma pagina com dados no periodo.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {worstPages.map((p, idx) => (
                      <div
                        key={p.pagePath}
                        className="flex items-center gap-2.5 rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-2"
                      >
                        <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">#{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate" title={p.pagePath}>
                            {p.pagePath}
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span>{p.sessions} sessoes</span>
                            <span>&middot;</span>
                            <span>{p.conversions} vendas</span>
                            <span>&middot;</span>
                            <span>Conv. {p.taxaConversao.toFixed(2)}%</span>
                            <span>&middot;</span>
                            <span>CR {p.connectRate !== null ? `${p.connectRate.toFixed(1)}%` : '—'}</span>
                          </div>
                        </div>
                        <PageStatusBadge status={p.status} reason={p.statusReason} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Decision rules */}
          <div className="rounded-lg border bg-card p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Diagnostico de Entrega</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-emerald-700">OK</span>: Connect Rate &ge; 70%, Engage Rate &ge; 50%
              </div>
              <div>
                <span className="font-medium text-amber-700">ATENCAO</span>: Connect Rate 40-70% OU Engage Rate 30-50%
              </div>
              <div>
                <span className="font-medium text-red-700">TRAVAR TRAFEGO</span>: Connect Rate &lt; 40% OU Engage Rate &lt; 30%
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <strong>Connect Rate</strong> = Sessoes (GA4) / Cliques no anuncio (Meta Ads). Identifica problemas tecnicos: lentidao, redirect, tracking quebrado.
            </div>
          </div>

          {/* Pages table */}
          <div className="flex-1 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Pagina</th>
                  <th className="text-right px-4 py-2.5 font-medium">Sessoes</th>
                  <th className="text-right px-4 py-2.5 font-medium">Vendas</th>
                  <th className="text-right px-4 py-2.5 font-medium">Taxa Conv.</th>
                  <th className="text-right px-4 py-2.5 font-medium">
                    <span className="cursor-help" title="Sessoes (GA4) / Cliques no anuncio (Meta Ads)">
                      Connect Rate
                    </span>
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium">Engage Rate</th>
                  <th className="text-right px-4 py-2.5 font-medium">Tempo Medio</th>
                  <th className="text-center px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.pagePath} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium truncate max-w-[300px]" title={page.pagePath}>
                        {page.pagePath}
                      </div>
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono">{page.sessions.toLocaleString('pt-BR')}</td>
                    <td className="text-right px-4 py-2.5 font-mono">{page.conversions}</td>
                    <td className="text-right px-4 py-2.5 font-mono">{page.taxaConversao.toFixed(2)}%</td>
                    <td className="text-right px-4 py-2.5 font-mono">
                      {page.connectRate !== null ? `${page.connectRate.toFixed(1)}%` : '—'}
                    </td>
                    <td className="text-right px-4 py-2.5 font-mono">{(page.engagementRate * 100).toFixed(1)}%</td>
                    <td className="text-right px-4 py-2.5 font-mono">{formatDuration(page.avgEngagementTime)}</td>
                    <td className="text-center px-4 py-2.5">
                      <PageStatusBadge status={page.status} reason={page.statusReason} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-muted-foreground text-center">
            Dados do Google Analytics 4 &middot; Periodo: {dateStart} a {dateEnd}
          </div>
        </>
      )}
    </div>
  );
}
