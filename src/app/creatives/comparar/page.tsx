'use client';

import { useState, useMemo } from 'react';
import { useCommandData } from '@/lib/hooks/use-command-data';
import { AdThumbnail } from '@/components/creatives/ad-thumbnail';
import { StatusBadge } from '@/components/creatives/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  GitCompare,
  FileText,
  Layers,
  CheckSquare,
  Square,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { CreativeWithDecision } from '@/lib/decision-engine';

type Tab = 'compare' | 'copy' | 'format' | 'campaign';

const TABS: { id: Tab; label: string; icon: typeof GitCompare }[] = [
  { id: 'compare', label: 'Lado a Lado', icon: GitCompare },
  { id: 'copy', label: 'Por Copy', icon: FileText },
  { id: 'format', label: 'Por Formato', icon: BarChart3 },
  { id: 'campaign', label: 'Por Campanha', icon: Layers },
];

export default function CompararPage() {
  const { creatives, settings, loading } = useCommandData();
  const [activeTab, setActiveTab] = useState<Tab>('compare');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (adId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(adId)) {
        next.delete(adId);
      } else if (next.size < 4) {
        next.add(adId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      <h1 className="text-xl font-bold mb-4">Comparar Criativos</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === 'compare' && (
            <CompareTab creatives={creatives} selected={selected} toggleSelect={toggleSelect} settings={settings} />
          )}
          {activeTab === 'copy' && <CopyTab creatives={creatives} />}
          {activeTab === 'format' && <FormatTab creatives={creatives} />}
          {activeTab === 'campaign' && <CampaignTab creatives={creatives} />}
        </>
      )}
    </div>
  );
}

// ── Tab 1: Side by Side ──

function CompareTab({
  creatives,
  selected,
  toggleSelect,
  settings,
}: {
  creatives: CreativeWithDecision[];
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  settings: { cpa_target: number; cpl_target: number };
}) {
  const selectedCreatives = creatives.filter(c => selected.has(c.ad_id));

  const metrics: { key: keyof CreativeWithDecision; label: string; format: (v: number | null) => string; higherBetter: boolean }[] = [
    { key: 'ctr', label: 'CTR', format: v => formatPercent(v), higherBetter: true },
    { key: 'compras', label: 'Conversoes', format: v => formatNumber(v), higherBetter: true },
    { key: 'cpa', label: 'Custo/Conv.', format: v => formatCurrency(v), higherBetter: false },
    { key: 'roas', label: 'ROAS', format: v => v != null ? `${(v as number).toFixed(1)}x` : '-', higherBetter: true },
    { key: 'spend', label: 'Gasto', format: v => formatCurrency(v), higherBetter: false },
    { key: 'clicks', label: 'Cliques', format: v => formatNumber(v), higherBetter: true },
    { key: 'frequency', label: 'Frequencia', format: v => v != null ? (v as number).toFixed(1) : '-', higherBetter: false },
    { key: 'score', label: 'Score', format: v => v != null ? String(Math.round(v as number)) : '-', higherBetter: true },
  ];

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Selection list */}
      <div className="col-span-4 rounded-lg border bg-card p-3 max-h-[600px] overflow-auto">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Selecione ate 4 criativos ({selected.size}/4)
        </div>
        <div className="space-y-1">
          {creatives.map(c => (
            <div
              key={c.ad_id}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors text-xs',
                selected.has(c.ad_id) ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'
              )}
              onClick={() => toggleSelect(c.ad_id)}
            >
              {selected.has(c.ad_id) ? (
                <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} size={24} />
              <span className="truncate flex-1">{c.name}</span>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Comparison grid */}
      <div className="col-span-8">
        {selectedCreatives.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <GitCompare className="h-10 w-10 mb-4 opacity-20" />
            <p className="text-sm">Selecione criativos para comparar</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-28">Metrica</th>
                  {selectedCreatives.map(c => (
                    <th key={c.ad_id} className="text-center px-3 py-2 font-medium">
                      <div className="flex flex-col items-center gap-1">
                        <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} size={32} />
                        <span className="text-xs truncate max-w-[120px]">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => {
                  const values = selectedCreatives.map(c => {
                    const val = c[m.key];
                    return typeof val === 'number' ? val : null;
                  });
                  const validValues = values.filter((v): v is number => v !== null);
                  const best = validValues.length > 0
                    ? (m.higherBetter ? Math.max(...validValues) : Math.min(...validValues))
                    : null;

                  return (
                    <tr key={m.key} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium text-xs text-muted-foreground">
                        {m.label}
                      </td>
                      {selectedCreatives.map((c, i) => {
                        const val = values[i];
                        const isBest = val !== null && val === best && validValues.length > 1;
                        return (
                          <td key={c.ad_id} className="text-center px-3 py-2 font-mono">
                            <span className={cn(
                              isBest && 'text-emerald-700 dark:text-emerald-400 font-bold'
                            )}>
                              {m.format(val)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Copy Analysis ──

function CopyTab({ creatives }: { creatives: CreativeWithDecision[] }) {
  // Group by headline
  const headlineGroups = useMemo(() => {
    const groups = new Map<string, CreativeWithDecision[]>();
    for (const c of creatives) {
      const key = c.headline || '(sem headline)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return [...groups.entries()]
      .map(([headline, items]) => {
        const totalConversions = items.reduce((s, c) => s + c.compras, 0);
        const totalSpend = items.reduce((s, c) => s + c.spend, 0);
        const totalImpr = items.reduce((s, c) => s + c.impressions, 0);
        const totalClicks = items.reduce((s, c) => s + c.clicks, 0);
        return {
          headline,
          count: items.length,
          conversions: totalConversions,
          spend: totalSpend,
          cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
          ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
        };
      })
      .sort((a, b) => b.conversions - a.conversions);
  }, [creatives]);

  // Group by CTA
  const ctaGroups = useMemo(() => {
    const groups = new Map<string, CreativeWithDecision[]>();
    for (const c of creatives) {
      const key = c.cta?.replace(/_/g, ' ') || '(sem CTA)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return [...groups.entries()]
      .map(([cta, items]) => {
        const totalConversions = items.reduce((s, c) => s + c.compras, 0);
        const totalSpend = items.reduce((s, c) => s + c.spend, 0);
        const totalImpr = items.reduce((s, c) => s + c.impressions, 0);
        const totalClicks = items.reduce((s, c) => s + c.clicks, 0);
        return {
          cta,
          count: items.length,
          conversions: totalConversions,
          spend: totalSpend,
          cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
          ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
        };
      })
      .sort((a, b) => b.conversions - a.conversions);
  }, [creatives]);

  return (
    <div className="space-y-6">
      {/* Headlines */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Performance por Headline</h2>
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Headline</th>
                <th className="text-right px-3 py-2 font-medium w-16">Ads</th>
                <th className="text-right px-3 py-2 font-medium w-20">Conv.</th>
                <th className="text-right px-3 py-2 font-medium w-24">CPA Medio</th>
                <th className="text-right px-3 py-2 font-medium w-20">CTR</th>
                <th className="text-right px-3 py-2 font-medium w-24">Gasto</th>
              </tr>
            </thead>
            <tbody>
              {headlineGroups.map((g, i) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 max-w-[300px] truncate" title={g.headline}>{g.headline}</td>
                  <td className="text-right px-3 py-2 font-mono">{g.count}</td>
                  <td className="text-right px-3 py-2 font-mono font-bold">{g.conversions}</td>
                  <td className="text-right px-3 py-2 font-mono">{formatCurrency(g.cpa)}</td>
                  <td className="text-right px-3 py-2 font-mono">{formatPercent(g.ctr)}</td>
                  <td className="text-right px-3 py-2 font-mono">{formatCurrency(g.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CTAs */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Performance por CTA</h2>
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">CTA</th>
                <th className="text-right px-3 py-2 font-medium w-16">Ads</th>
                <th className="text-right px-3 py-2 font-medium w-20">Conv.</th>
                <th className="text-right px-3 py-2 font-medium w-24">CPA Medio</th>
                <th className="text-right px-3 py-2 font-medium w-20">CTR</th>
                <th className="text-right px-3 py-2 font-medium w-24">Gasto</th>
              </tr>
            </thead>
            <tbody>
              {ctaGroups.map((g, i) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2">{g.cta}</td>
                  <td className="text-right px-3 py-2 font-mono">{g.count}</td>
                  <td className="text-right px-3 py-2 font-mono font-bold">{g.conversions}</td>
                  <td className="text-right px-3 py-2 font-mono">{formatCurrency(g.cpa)}</td>
                  <td className="text-right px-3 py-2 font-mono">{formatPercent(g.ctr)}</td>
                  <td className="text-right px-3 py-2 font-mono">{formatCurrency(g.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab 3: Format Analysis ──

function FormatTab({ creatives }: { creatives: CreativeWithDecision[] }) {
  const formatGroups = useMemo(() => {
    const groups = new Map<string, CreativeWithDecision[]>();
    for (const c of creatives) {
      const key = c.format || 'desconhecido';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return [...groups.entries()].map(([fmt, items]) => {
      const totalConv = items.reduce((s, c) => s + c.compras, 0);
      const totalSpend = items.reduce((s, c) => s + c.spend, 0);
      const totalImpr = items.reduce((s, c) => s + c.impressions, 0);
      const totalClicks = items.reduce((s, c) => s + c.clicks, 0);
      const avgFreq = items.filter(c => c.frequency != null).length > 0
        ? items.reduce((s, c) => s + (c.frequency ?? 0), 0) / items.filter(c => c.frequency != null).length
        : null;
      return {
        format: fmt,
        count: items.length,
        conversions: totalConv,
        spend: totalSpend,
        cpa: totalConv > 0 ? totalSpend / totalConv : null,
        ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
        avgFrequency: avgFreq,
      };
    });
  }, [creatives]);

  const chartData = formatGroups.map(g => ({
    name: g.format.charAt(0).toUpperCase() + g.format.slice(1),
    CPA: g.cpa ? Math.round(g.cpa * 100) / 100 : 0,
    CTR: Math.round(g.ctr * 100) / 100,
    Conversoes: g.conversions,
  }));

  return (
    <div className="space-y-6">
      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">CPA por Formato</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} width={50} tickFormatter={v => `R$${v}`} />
              <Tooltip formatter={((v: number) => [`R$${v.toFixed(2)}`, 'CPA']) as never} />
              <Bar dataKey="CPA" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Conversoes por Formato</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} width={35} />
              <Tooltip />
              <Bar dataKey="Conversoes" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Formato</th>
              <th className="text-right px-3 py-2 font-medium">Ads</th>
              <th className="text-right px-3 py-2 font-medium">Conv.</th>
              <th className="text-right px-3 py-2 font-medium">CPA</th>
              <th className="text-right px-3 py-2 font-medium">CTR</th>
              <th className="text-right px-3 py-2 font-medium">Freq. Media</th>
              <th className="text-right px-3 py-2 font-medium">Gasto</th>
            </tr>
          </thead>
          <tbody>
            {formatGroups.map(g => (
              <tr key={g.format} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2 font-medium capitalize">{g.format}</td>
                <td className="text-right px-3 py-2 font-mono">{g.count}</td>
                <td className="text-right px-3 py-2 font-mono font-bold">{g.conversions}</td>
                <td className="text-right px-3 py-2 font-mono">{formatCurrency(g.cpa)}</td>
                <td className="text-right px-3 py-2 font-mono">{formatPercent(g.ctr)}</td>
                <td className="text-right px-3 py-2 font-mono">{g.avgFrequency != null ? g.avgFrequency.toFixed(1) : '-'}</td>
                <td className="text-right px-3 py-2 font-mono">{formatCurrency(g.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 4: Campaign Analysis ──

function CampaignTab({ creatives }: { creatives: CreativeWithDecision[] }) {
  const campaignGroups = useMemo(() => {
    const groups = new Map<string, CreativeWithDecision[]>();
    for (const c of creatives) {
      const key = c.campaign_name || c.campaign_id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(c);
    }
    return [...groups.entries()]
      .map(([campaign, items]) => {
        const totalConv = items.reduce((s, c) => s + c.compras, 0);
        const totalSpend = items.reduce((s, c) => s + c.spend, 0);
        const totalImpr = items.reduce((s, c) => s + c.impressions, 0);
        const totalClicks = items.reduce((s, c) => s + c.clicks, 0);
        const statusDist = {
          ESCALAR: items.filter(c => c.status === 'ESCALAR').length,
          VARIAR: items.filter(c => c.status === 'VARIAR').length,
          MATAR: items.filter(c => c.status === 'MATAR').length,
          APRENDENDO: items.filter(c => c.status === 'APRENDENDO').length,
        };
        return {
          campaign,
          type: items[0]?.campaign_type || 'VENDAS',
          count: items.length,
          conversions: totalConv,
          spend: totalSpend,
          cpa: totalConv > 0 ? totalSpend / totalConv : null,
          ctr: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
          statusDist,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [creatives]);

  return (
    <div className="space-y-2">
      {campaignGroups.map(g => {
        const total = g.count;
        const escalarPct = total > 0 ? (g.statusDist.ESCALAR / total) * 100 : 0;
        const variarPct = total > 0 ? (g.statusDist.VARIAR / total) * 100 : 0;
        const matarPct = total > 0 ? (g.statusDist.MATAR / total) * 100 : 0;
        const aprendendoPct = total > 0 ? (g.statusDist.APRENDENDO / total) * 100 : 0;

        return (
          <div key={g.campaign} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate max-w-[400px]">{g.campaign}</span>
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  g.type === 'CAPTURA' ? 'bg-purple-500/10 text-purple-700' : 'bg-blue-500/10 text-blue-700'
                )}>
                  {g.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{g.count} anuncios</span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-4 gap-4 mb-3">
              <div>
                <div className="text-[10px] text-muted-foreground">Gasto</div>
                <div className="text-sm font-bold font-mono">{formatCurrency(g.spend)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Conversoes</div>
                <div className="text-sm font-bold font-mono">{g.conversions}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">{g.type === 'CAPTURA' ? 'CPL' : 'CPA'}</div>
                <div className="text-sm font-bold font-mono">{formatCurrency(g.cpa)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">CTR</div>
                <div className="text-sm font-bold font-mono">{formatPercent(g.ctr)}</div>
              </div>
            </div>

            {/* Status distribution bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                {escalarPct > 0 && <div className="h-full bg-emerald-500" style={{ width: `${escalarPct}%` }} />}
                {aprendendoPct > 0 && <div className="h-full bg-blue-500" style={{ width: `${aprendendoPct}%` }} />}
                {variarPct > 0 && <div className="h-full bg-amber-500" style={{ width: `${variarPct}%` }} />}
                {matarPct > 0 && <div className="h-full bg-red-500" style={{ width: `${matarPct}%` }} />}
              </div>
              <div className="flex gap-2 text-[10px] text-muted-foreground shrink-0">
                {g.statusDist.ESCALAR > 0 && <span className="text-emerald-600">{g.statusDist.ESCALAR} escalar</span>}
                {g.statusDist.APRENDENDO > 0 && <span className="text-blue-600">{g.statusDist.APRENDENDO} aprend.</span>}
                {g.statusDist.VARIAR > 0 && <span className="text-amber-600">{g.statusDist.VARIAR} variar</span>}
                {g.statusDist.MATAR > 0 && <span className="text-red-600">{g.statusDist.MATAR} matar</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
