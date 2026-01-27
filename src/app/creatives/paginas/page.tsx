'use client';

import { useAccount } from '@/components/creatives/account-context';
import { Globe, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

type PageStatus = 'OK' | 'OTIMIZAR' | 'TRAVAR TRAFEGO';

const statusIcons: Record<PageStatus, React.ComponentType<{ className?: string }>> = {
  OK: CheckCircle,
  OTIMIZAR: AlertTriangle,
  'TRAVAR TRAFEGO': XCircle,
};

const statusColors: Record<PageStatus, string> = {
  OK: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  OTIMIZAR: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  'TRAVAR TRAFEGO': 'bg-red-500/15 text-red-700 dark:text-red-400',
};

function PageStatusBadge({ status }: { status: PageStatus }) {
  const Icon = statusIcons[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold tracking-wide ${statusColors[status]}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

const examplePages = [
  {
    url: '/vendas/produto-a',
    name: 'Pagina Produto A',
    sessions: 1200,
    clicks: 1500,
    connectRate: 80,
    conversions: 45,
    conversionRate: 3.75,
    loadTime: 2.1,
    status: 'OK' as PageStatus,
  },
  {
    url: '/vendas/produto-b',
    name: 'Pagina Produto B',
    sessions: 600,
    clicks: 1100,
    connectRate: 54.5,
    conversions: 12,
    conversionRate: 2.0,
    loadTime: 4.8,
    status: 'OTIMIZAR' as PageStatus,
  },
  {
    url: '/vendas/produto-c',
    name: 'Pagina Produto C',
    sessions: 200,
    clicks: 900,
    connectRate: 22.2,
    conversions: 2,
    conversionRate: 1.0,
    loadTime: 7.3,
    status: 'TRAVAR TRAFEGO' as PageStatus,
  },
];

export default function PaginasPage() {
  const { selectedAccount, accounts } = useAccount();
  const accountName = accounts.find(a => a.ad_account_id === selectedAccount)?.name || selectedAccount;

  return (
      <div className="flex flex-1 flex-col px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Performance de Paginas</h1>
            {accountName && (
              <span className="text-xs text-muted-foreground">{accountName}</span>
            )}
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">
              {examplePages.filter(p => p.status === 'OK').length} OK
            </span>
            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700">
              {examplePages.filter(p => p.status === 'OTIMIZAR').length} otimizar
            </span>
            <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700">
              {examplePages.filter(p => p.status === 'TRAVAR TRAFEGO').length} travar
            </span>
          </div>
        </div>

        {/* Status explanation */}
        <div className="rounded-lg border bg-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Regras de Decisao</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-emerald-700">OK</span>: Connect Rate &ge; 70%, Taxa Conv. &ge; 2.5%, Load &le; 3s
            </div>
            <div>
              <span className="font-medium text-amber-700">OTIMIZAR</span>: Connect Rate 40-70% OU Taxa Conv. 1-2.5% OU Load 3-5s
            </div>
            <div>
              <span className="font-medium text-red-700">TRAVAR TRAFEGO</span>: Connect Rate &lt; 40% OU Taxa Conv. &lt; 1% OU Load &gt; 5s
            </div>
          </div>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Connect Rate Medio</div>
            <div className="text-xl font-bold">
              {(examplePages.reduce((s, p) => s + p.connectRate, 0) / examplePages.length).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Sessoes / Cliques no anuncio</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Taxa Conversao Media</div>
            <div className="text-xl font-bold">
              {(examplePages.reduce((s, p) => s + p.conversionRate, 0) / examplePages.length).toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Conversoes / Sessoes</div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <div className="text-xs text-muted-foreground mb-1">Tempo Medio Carregamento</div>
            <div className="text-xl font-bold">
              {(examplePages.reduce((s, p) => s + p.loadTime, 0) / examplePages.length).toFixed(1)}s
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Core Web Vitals</div>
          </div>
        </div>

        {/* Pages table */}
        <div className="flex-1 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Pagina</th>
                <th className="text-right px-4 py-2.5 font-medium">Cliques</th>
                <th className="text-right px-4 py-2.5 font-medium">Sessoes</th>
                <th className="text-right px-4 py-2.5 font-medium">Connect Rate</th>
                <th className="text-right px-4 py-2.5 font-medium">Conversoes</th>
                <th className="text-right px-4 py-2.5 font-medium">Taxa Conv.</th>
                <th className="text-right px-4 py-2.5 font-medium">Load Time</th>
                <th className="text-center px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {examplePages.map((page) => (
                <tr key={page.url} className="border-b hover:bg-muted/50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{page.name}</div>
                    <div className="text-xs text-muted-foreground">{page.url}</div>
                  </td>
                  <td className="text-right px-4 py-2.5 font-mono">{page.clicks.toLocaleString('pt-BR')}</td>
                  <td className="text-right px-4 py-2.5 font-mono">{page.sessions.toLocaleString('pt-BR')}</td>
                  <td className="text-right px-4 py-2.5 font-mono">{page.connectRate.toFixed(1)}%</td>
                  <td className="text-right px-4 py-2.5 font-mono">{page.conversions}</td>
                  <td className="text-right px-4 py-2.5 font-mono">{page.conversionRate.toFixed(2)}%</td>
                  <td className="text-right px-4 py-2.5 font-mono">{page.loadTime.toFixed(1)}s</td>
                  <td className="text-center px-4 py-2.5">
                    <PageStatusBadge status={page.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Integration note */}
        <div className="mt-3 text-xs text-muted-foreground text-center">
          Dados de exemplo. Conecte Google Analytics ou Meta Pixel para dados reais de paginas.
        </div>
      </div>
  );
}
