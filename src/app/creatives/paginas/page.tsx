'use client';

import { useAccount } from '@/components/creatives/account-context';
import { Globe, AlertTriangle, CheckCircle, XCircle, RefreshCw, Settings, Loader2, Info } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
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
}

interface SummaryData {
  totalSessions: number;
  totalEngagedSessions: number;
  avgEngagementRate: number;
  avgEngagementTime: number;
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
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
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
          {/* Metric cards */}
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

          {/* Pages table */}
          <div className="flex-1 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Pagina</th>
                  <th className="text-right px-4 py-2.5 font-medium">Sessoes</th>
                  <th className="text-right px-4 py-2.5 font-medium">Engajadas</th>
                  <th className="text-right px-4 py-2.5 font-medium">Engage Rate</th>
                  <th className="text-right px-4 py-2.5 font-medium">Tempo Medio</th>
                  <th className="text-right px-4 py-2.5 font-medium">
                    <span className="cursor-help" title="Sessoes (GA4) / Cliques no anuncio (Meta Ads)">
                      Connect Rate
                    </span>
                  </th>
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
                    <td className="text-right px-4 py-2.5 font-mono">{page.engagedSessions.toLocaleString('pt-BR')}</td>
                    <td className="text-right px-4 py-2.5 font-mono">{(page.engagementRate * 100).toFixed(1)}%</td>
                    <td className="text-right px-4 py-2.5 font-mono">{formatDuration(page.avgEngagementTime)}</td>
                    <td className="text-right px-4 py-2.5 font-mono">
                      {page.connectRate !== null ? `${page.connectRate.toFixed(1)}%` : '—'}
                    </td>
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
