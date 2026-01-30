'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { StatusBadge } from '@/components/creatives/status-badge';
import { useAccount } from '@/components/creatives/account-context';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trophy,
  Skull,
  MousePointerClick,
  Zap,
  TrendingUp,
  ImageIcon,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@/lib/format';
import {
  applyDecisions,
  DEFAULT_SETTINGS,
  type CreativeWithDecision,
  type CreativeMetrics,
} from '@/lib/decision-engine';

// --------------- InsightBlock component ---------------

interface InsightItem {
  ad_id: string;
  name: string;
  thumbnail_url: string | null;
  status: CreativeWithDecision['status'];
  metrics: string[];
}

function InsightBlock({
  icon: Icon,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  items,
  emptyText,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  items: InsightItem[];
  emptyText: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <Link
          href={ctaHref}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {ctaLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <Link
                key={item.ad_id}
                href={`/creatives/diagnostico/${item.ad_id}`}
                className="flex items-center gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
                  #{idx + 1}
                </span>
                {item.thumbnail_url ? (
                  <Image
                    src={item.thumbnail_url}
                    alt=""
                    width={28}
                    height={28}
                    className="rounded object-cover shrink-0"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded bg-muted shrink-0">
                    <ImageIcon className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{item.name}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {item.metrics.map((m, mi) => (
                      <span key={mi}>
                        {mi > 0 && <span className="mr-1.5">&middot;</span>}
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
    </div>
  );
}

// --------------- Page ---------------

export default function DestaquesPage() {
  const { selectedAccount, dateStart, dateEnd } = useAccount();
  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [ctrBenchmark, setCtrBenchmark] = useState(0);
  const [loading, setLoading] = useState(true);

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
        const withDecisions = applyDecisions(raw, DEFAULT_SETTINGS, {});
        setCreatives(withDecisions);
        setCtrBenchmark(
          raw.length > 0
            ? (raw.reduce((s, c) => s + c.clicks, 0) /
                raw.reduce((s, c) => s + c.impressions, 0)) *
                100
            : 0
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd]);

  useEffect(() => {
    setCreatives([]);
    fetchData();
  }, [fetchData]);

  // ---- Bloco 1: Melhores Criativos ----
  const melhores = creatives
    .filter((c) => c.status !== 'MATAR' && c.compras > 0)
    .sort((a, b) => {
      if (b.compras !== a.compras) return b.compras - a.compras;
      const cpaA = a.cpa ?? Infinity;
      const cpaB = b.cpa ?? Infinity;
      if (cpaA !== cpaB) return cpaA - cpaB;
      return b.ctr - a.ctr;
    })
    .slice(0, 5);

  // ---- Bloco 2: Piores Criativos ----
  const cpaTarget = DEFAULT_SETTINGS.cpa_target;
  const minSpend = DEFAULT_SETTINGS.min_spend;

  const piores = creatives
    .filter(
      (c) =>
        c.status === 'MATAR' ||
        (c.spend >= minSpend && c.compras === 0) ||
        (c.cpa !== null && c.cpa > cpaTarget * 1.3)
    )
    .sort((a, b) => {
      // Gasto desperdicado (spend com 0 compras) desc
      const wasteA = a.compras === 0 ? a.spend : 0;
      const wasteB = b.compras === 0 ? b.spend : 0;
      if (wasteB !== wasteA) return wasteB - wasteA;
      // Ratio CPA/alvo desc
      const ratioA = a.cpa !== null ? a.cpa / cpaTarget : 0;
      const ratioB = b.cpa !== null ? b.cpa / cpaTarget : 0;
      if (ratioB !== ratioA) return ratioB - ratioA;
      // CTR asc
      return a.ctr - b.ctr;
    })
    .slice(0, 5);

  // ---- Bloco 3: Muitos Cliques, Baixa Conversao ----
  const medianClicks = (() => {
    const sorted = [...creatives].sort((a, b) => a.clicks - b.clicks);
    if (sorted.length === 0) return 10;
    const mid = Math.floor(sorted.length / 2);
    return Math.max(10, sorted[mid].clicks);
  })();

  const muitosCliques = creatives
    .filter((c) => {
      if (c.clicks < medianClicks) return false;
      const convRate = c.clicks > 0 ? (c.compras / c.clicks) * 100 : 0;
      return c.compras === 0 || convRate < 1;
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  // ---- Bloco 4: Hook Forte, Conversao Fraca ----
  const hookForte = creatives
    .filter((c) => {
      if (c.ctr < ctrBenchmark) return false;
      const noConv = c.compras === 0 && c.spend >= minSpend;
      const cpaBad = c.cpa !== null && c.cpa > cpaTarget;
      return noConv || cpaBad;
    })
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 5);

  // ---- Bloco 5: Destaques de Conversao ----
  const destaquesConv = creatives
    .filter((c) => c.clicks >= 10 && c.compras > 0)
    .sort((a, b) => {
      const rateA = a.compras / a.clicks;
      const rateB = b.compras / b.clicks;
      return rateB - rateA;
    })
    .slice(0, 5);

  // Helpers to build InsightItem
  function toItem(c: CreativeWithDecision, metrics: string[]): InsightItem {
    return {
      ad_id: c.ad_id,
      name: c.name,
      thumbnail_url: c.thumbnail_url,
      status: c.status,
      metrics,
    };
  }

  return (
      <div className="flex flex-1 flex-col px-6 py-4">
        <h1 className="text-xl font-bold mb-4">Destaques</h1>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Bloco 1 */}
          <InsightBlock
            icon={Trophy}
            title="Melhores Criativos"
            subtitle="Mais vendas com menor CPA"
            ctaLabel="Ver no Painel de Comando"
            ctaHref="/creatives"
            loading={loading}
            emptyText="Nenhum criativo com vendas no periodo."
            items={melhores.map((c) =>
              toItem(c, [
                `${c.compras} vendas`,
                formatCurrency(c.cpa),
                `CTR ${formatPercent(c.ctr)}`,
              ])
            )}
          />

          {/* Bloco 2 */}
          <InsightBlock
            icon={Skull}
            title="Piores Criativos"
            subtitle="Maior gasto desperdicado ou CPA acima do alvo"
            ctaLabel="Ver Diagnostico"
            ctaHref="/creatives/diagnostico"
            loading={loading}
            emptyText="Nenhum criativo com performance critica."
            items={piores.map((c) =>
              toItem(c, [
                `R$${c.spend.toFixed(2)} gasto`,
                c.compras === 0
                  ? '0 vendas'
                  : `CPA ${formatCurrency(c.cpa)}`,
                `CTR ${formatPercent(c.ctr)}`,
              ])
            )}
          />

          {/* Bloco 3 */}
          <InsightBlock
            icon={MousePointerClick}
            title="Muitos Cliques, Baixa Conversao"
            subtitle="Alto interesse mas nao convertem"
            ctaLabel="Ver Alinhamento"
            ctaHref="/creatives/alinhamento"
            loading={loading}
            emptyText="Nenhum criativo nesta categoria."
            items={muitosCliques.map((c) => {
              const convRate =
                c.clicks > 0 ? ((c.compras / c.clicks) * 100).toFixed(2) : '0';
              return toItem(c, [
                `${c.clicks} cliques`,
                `${c.compras} vendas`,
                `Conv. ${convRate}%`,
              ]);
            })}
          />

          {/* Bloco 4 */}
          <InsightBlock
            icon={Zap}
            title="Hook Forte, Conversao Fraca"
            subtitle="CTR acima do benchmark mas nao convertem"
            ctaLabel="Ver Diagnostico"
            ctaHref="/creatives/diagnostico"
            loading={loading}
            emptyText="Nenhum criativo nesta categoria."
            items={hookForte.map((c) =>
              toItem(c, [
                `CTR ${formatPercent(c.ctr)}`,
                c.compras === 0
                  ? '0 vendas'
                  : `CPA ${formatCurrency(c.cpa)}`,
                `R$${c.spend.toFixed(2)} gasto`,
              ])
            )}
          />

          {/* Bloco 5 */}
          <InsightBlock
            icon={TrendingUp}
            title="Destaques de Conversao"
            subtitle="Maior taxa de conversao (compras/cliques)"
            ctaLabel="Ver Alinhamento"
            ctaHref="/creatives/alinhamento"
            loading={loading}
            emptyText="Nenhum criativo com conversoes e cliques suficientes."
            items={destaquesConv.map((c) => {
              const rate = ((c.compras / c.clicks) * 100).toFixed(2);
              return toItem(c, [
                `${rate}% conv.`,
                `${c.compras} vendas`,
                `${c.clicks} cliques`,
              ]);
            })}
          />
        </div>
      </div>
  );
}
