'use client';

import { useEffect, useState, useCallback } from 'react';
import { StatusBadge } from '@/components/creatives/status-badge';
import { useAccount } from '@/components/creatives/account-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Loader2,
  ImageIcon,
  ArrowRight,
  Trophy,
  TrendingUp,
  MousePointerClick,
  type LucideIcon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';
import {
  applyDecisions,
  DEFAULT_SETTINGS,
  type CreativeWithDecision,
} from '@/lib/decision-engine';

type AlignmentStatus = 'ALINHADO' | 'DESALINHADO' | 'CRITICO';

const alignmentColors: Record<AlignmentStatus, string> = {
  ALINHADO: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  DESALINHADO: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  CRITICO: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

function AlignmentBadge({ status }: { status: AlignmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide ${alignmentColors[status]}`}>
      {status}
    </span>
  );
}

function getAlignmentStatus(creative: CreativeWithDecision): AlignmentStatus {
  if (creative.status === 'ESCALAR') return 'ALINHADO';
  if (creative.status === 'MATAR') return 'CRITICO';
  return 'DESALINHADO';
}

// --------------- RankingBlock ---------------

interface RankingItem {
  ad_id: string;
  name: string;
  thumbnail_url: string | null;
  status: CreativeWithDecision['status'];
  metrics: string[];
}

function RankingBlock({
  icon: Icon,
  title,
  items,
  emptyText,
}: {
  icon: LucideIcon;
  title: string;
  items: RankingItem[];
  emptyText: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((item, idx) => (
            <Link
              key={item.ad_id}
              href={`/creatives/diagnostico/${item.ad_id}`}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/50 transition-colors"
            >
              <span className="text-[10px] font-bold text-muted-foreground w-3 shrink-0">
                #{idx + 1}
              </span>
              {item.thumbnail_url ? (
                <Image
                  src={item.thumbnail_url}
                  alt=""
                  width={24}
                  height={24}
                  className="rounded object-cover shrink-0"
                  unoptimized
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded bg-muted shrink-0">
                  <ImageIcon className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium truncate">{item.name}</div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {item.metrics.map((m, mi) => (
                    <span key={mi}>
                      {mi > 0 && <span className="mr-1">&middot;</span>}
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              <StatusBadge status={item.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------- Campaign Group ---------------

interface CampaignGroup {
  name: string;
  totalSpend: number;
  creatives: CreativeWithDecision[];
}

function buildCampaignGroups(creatives: CreativeWithDecision[]): CampaignGroup[] {
  const map = new Map<string, CreativeWithDecision[]>();
  for (const c of creatives) {
    const key = c.campaign_name || 'Sem campanha';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  return Array.from(map.entries())
    .map(([name, items]) => ({
      name,
      totalSpend: items.reduce((s, c) => s + c.spend, 0),
      creatives: items,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}

function toRankingItem(c: CreativeWithDecision, metrics: string[]): RankingItem {
  return {
    ad_id: c.ad_id,
    name: c.name,
    thumbnail_url: c.thumbnail_url,
    status: c.status,
    metrics,
  };
}

// --------------- Page ---------------

export default function AlinhamentoPage() {
  const { selectedAccount, dateStart, dateEnd } = useAccount();
  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=command`
      );
      if (res.ok) {
        const data = await res.json();
        const withDecisions = applyDecisions(data.creatives || [], DEFAULT_SETTINGS, {});
        setCreatives(withDecisions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd]);

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

  const countByAlignment = (s: AlignmentStatus) => creatives.filter(c => getAlignmentStatus(c) === s).length;

  const campaignGroups = buildCampaignGroups(creatives);

  return (
      <div className="flex flex-1 flex-col px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Alinhamento Criativo x Pagina</h1>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-700">{countByAlignment('ALINHADO')} alinhado</span>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700">{countByAlignment('DESALINHADO')} desalinhado</span>
              <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700">{countByAlignment('CRITICO')} critico</span>
            </div>
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm" className="h-8">
              {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
              Sync
            </Button>
          </div>
        </div>

        {/* Explanation card */}
        <div className="rounded-lg border bg-card p-4 mb-4">
          <div className="text-sm font-medium mb-2">Como funciona o Alinhamento</div>
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-emerald-700">ALINHADO</span>: Criativo performando bem + pagina convertendo bem. Escalar investimento.
            </div>
            <div>
              <span className="font-medium text-amber-700">DESALINHADO</span>: Criativo bom + pagina ruim (ou vice-versa). Otimizar o elo fraco.
            </div>
            <div>
              <span className="font-medium text-red-700">CRITICO</span>: Criativo e pagina performando mal. Pausar e revisar ambos.
            </div>
          </div>
        </div>

        {/* Contextual Rankings by Campaign */}
        {!loading && campaignGroups.length > 0 && (
          <div className="mb-4 space-y-4">
            {campaignGroups.map((group) => {
              // 1. Melhores nesta pagina: compras desc, CPA asc, top 3
              const best = group.creatives
                .filter((c) => c.compras > 0)
                .sort((a, b) => {
                  if (b.compras !== a.compras) return b.compras - a.compras;
                  const cpaA = a.cpa ?? Infinity;
                  const cpaB = b.cpa ?? Infinity;
                  return cpaA - cpaB;
                })
                .slice(0, 3);

              // 2. Maior taxa de conversao: clicks >= 10, compras > 0, conv rate desc
              const bestConv = group.creatives
                .filter((c) => c.clicks >= 10 && c.compras > 0)
                .sort((a, b) => {
                  const rateA = a.compras / a.clicks;
                  const rateB = b.compras / b.clicks;
                  return rateB - rateA;
                })
                .slice(0, 3);

              // 3. Clicam mas nao convertem: clicks > 0, 0 compras, min spend
              const clickNoConv = group.creatives
                .filter(
                  (c) =>
                    c.clicks > 0 &&
                    c.compras === 0 &&
                    c.spend >= DEFAULT_SETTINGS.min_spend
                )
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 3);

              const hasAnyData = best.length > 0 || bestConv.length > 0 || clickNoConv.length > 0;

              if (!hasAnyData) return null;

              return (
                <div key={group.name}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-sm font-medium">{group.name}</div>
                    <span className="text-[10px] text-muted-foreground">
                      {group.creatives.length} criativos &middot; {formatCurrency(group.totalSpend)} gasto
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <RankingBlock
                      icon={Trophy}
                      title="Melhores nesta campanha"
                      emptyText="Sem compras nesta campanha."
                      items={best.map((c) =>
                        toRankingItem(c, [
                          `${c.compras} compras`,
                          formatCurrency(c.cpa),
                        ])
                      )}
                    />
                    <RankingBlock
                      icon={TrendingUp}
                      title="Maior taxa de conversao"
                      emptyText="Sem dados suficientes."
                      items={bestConv.map((c) => {
                        const rate = ((c.compras / c.clicks) * 100).toFixed(2);
                        return toRankingItem(c, [
                          `${rate}% conv.`,
                          `${c.compras} compras`,
                        ]);
                      })}
                    />
                    <RankingBlock
                      icon={MousePointerClick}
                      title="Clicam mas nao convertem"
                      emptyText="Todos convertem ou gasto insuficiente."
                      items={clickNoConv.map((c) =>
                        toRankingItem(c, [
                          `${c.clicks} cliques`,
                          `R$${c.spend.toFixed(2)} gasto`,
                        ])
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading skeleton for rankings */}
        {loading && (
          <div className="mb-4 space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-5 w-48 mb-2" />
                <div className="grid grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <Skeleton key={j} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alignment table */}
        <div className="rounded-md border overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10 border-b">
              <tr>
                <th className="w-10 px-3 py-2.5"></th>
                <th className="text-left px-3 py-2.5 font-medium">Criativo</th>
                <th className="text-center px-3 py-2.5 font-medium w-28">Status Criativo</th>
                <th className="text-center px-3 py-2.5 font-medium w-10">
                  <ArrowRight className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium">Pagina Destino</th>
                <th className="text-right px-3 py-2.5 font-medium w-20">CTR</th>
                <th className="text-right px-3 py-2.5 font-medium w-20">Compras</th>
                <th className="text-right px-3 py-2.5 font-medium w-24">CPA</th>
                <th className="text-center px-3 py-2.5 font-medium w-32">Alinhamento</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><Skeleton className="h-5 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : creatives.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    Nenhum criativo ativo com dados no periodo.
                  </td>
                </tr>
              ) : (
                creatives.map((c) => {
                  const alignment = getAlignmentStatus(c);
                  return (
                    <tr key={c.ad_id} className="border-b hover:bg-muted/50">
                      <td className="px-3 py-2">
                        {c.thumbnail_url ? (
                          <Image src={c.thumbnail_url} alt="" width={32} height={32} className="rounded object-cover" unoptimized />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[200px]">
                          <div className="text-sm font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.campaign_name}</div>
                        </div>
                      </td>
                      <td className="text-center px-3 py-2">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="text-center px-3 py-2">
                        <ArrowRight className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-muted-foreground italic">
                          Sem pagina vinculada
                        </div>
                      </td>
                      <td className="text-right px-3 py-2 font-mono text-sm">{formatPercent(c.ctr)}</td>
                      <td className="text-right px-3 py-2 font-mono text-sm">{formatNumber(c.compras)}</td>
                      <td className="text-right px-3 py-2 font-mono text-sm">{formatCurrency(c.cpa)}</td>
                      <td className="text-center px-3 py-2">
                        <AlignmentBadge status={alignment} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Integration note */}
        <div className="mt-3 text-xs text-muted-foreground text-center">
          Conecte dados de paginas (GA4 / GTM) para alinhamento completo entre criativo e pagina de destino.
        </div>
      </div>
  );
}
