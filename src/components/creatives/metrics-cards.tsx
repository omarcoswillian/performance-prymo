'use client';

import {
  DollarSign,
  Eye,
  MousePointerClick,
  Target,
  TrendingUp,
  BarChart3,
} from 'lucide-react';
import { MetricCard } from '@/components/shared/metric-card';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import type { MetricsSummary } from '@/types/database';

interface MetricsCardsProps {
  summary: MetricsSummary | null;
  loading: boolean;
}

export function MetricsCards({ summary, loading }: MetricsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        title="Investimento"
        value={formatCurrency(summary?.total_spend)}
        icon={DollarSign}
        loading={loading}
      />
      <MetricCard
        title="Impressoes"
        value={formatNumber(summary?.total_impressions)}
        icon={Eye}
        loading={loading}
      />
      <MetricCard
        title="Cliques"
        value={formatNumber(summary?.total_clicks)}
        icon={MousePointerClick}
        loading={loading}
      />
      <MetricCard
        title="CTR"
        value={formatPercent(summary?.ctr)}
        icon={TrendingUp}
        loading={loading}
      />
      <MetricCard
        title="Conversoes"
        value={formatNumber(summary?.total_conversions)}
        icon={Target}
        loading={loading}
      />
      <MetricCard
        title="CPA"
        value={formatCurrency(summary?.cpa)}
        icon={BarChart3}
        loading={loading}
      />
    </div>
  );
}
