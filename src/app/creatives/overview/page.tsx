'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@/components/creatives/account-context';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import {
  LayoutDashboard,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingUp,
  AlertTriangle,
  Bell,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Shield,
} from 'lucide-react';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/format';

interface AccountSummary {
  ad_account_id: string;
  name: string;
  health: 'healthy' | 'degraded' | 'expired' | 'unknown';
  credential_type: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  cpa: number | null;
  ctr: number;
  roas: number | null;
  active_ads: number;
  active_alerts: number;
  last_sync: string | null;
  last_sync_status: string | null;
}

interface Totals {
  spend: number;
  conversions: number;
  conversion_value: number;
  cpa: number | null;
  roas: number | null;
  account_count: number;
}

const HEALTH_CONFIG = {
  healthy: { color: 'text-emerald-600', bg: 'bg-emerald-500', Icon: ShieldCheck },
  degraded: { color: 'text-amber-600', bg: 'bg-amber-500', Icon: ShieldAlert },
  expired: { color: 'text-red-600', bg: 'bg-red-500', Icon: ShieldX },
  unknown: { color: 'text-gray-400', bg: 'bg-gray-400', Icon: Shield },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function OverviewPage() {
  const router = useRouter();
  const { dateStart, dateEnd, setSelectedAccount } = useAccount();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/meta/overview?date_start=${dateStart}&date_end=${dateEnd}`
      );
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
        setTotals(data.totals || null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectAccount = (adAccountId: string) => {
    setSelectedAccount(adAccountId);
    router.push('/creatives');
  };

  const expiredAccounts = accounts.filter(a => a.health === 'expired');

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      <div className="flex items-center gap-3 mb-4">
        <LayoutDashboard className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-bold">Visao Geral</h1>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {accounts.length} conta{accounts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Expired credentials banner */}
      {expiredAccounts.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-red-700 dark:text-red-400">
              {expiredAccounts.length} conta{expiredAccounts.length > 1 ? 's' : ''} com credencial expirada:
            </span>{' '}
            <span className="text-red-600 dark:text-red-300">
              {expiredAccounts.map(a => a.name).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Summary row */}
      {!loading && totals && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Gasto Total
            </div>
            <div className="text-2xl font-bold">{formatCurrency(totals.spend)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <ShoppingCart className="h-3.5 w-3.5" />
              Conversoes
            </div>
            <div className="text-2xl font-bold">{formatNumber(totals.conversions)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Target className="h-3.5 w-3.5" />
              CPA Medio
            </div>
            <div className="text-2xl font-bold">{formatCurrency(totals.cpa)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              ROAS Medio
            </div>
            <div className="text-2xl font-bold">
              {totals.roas != null ? `${totals.roas.toFixed(1)}x` : '-'}
            </div>
          </div>
        </div>
      )}

      {/* Account cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <LayoutDashboard className="h-10 w-10 mb-4 opacity-20" />
          <p className="text-sm font-medium">Nenhuma conta conectada</p>
          <p className="text-xs mt-1">Conecte uma conta Meta Ads nas configuracoes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(account => {
            const healthConfig = HEALTH_CONFIG[account.health];
            const HealthIcon = healthConfig.Icon;

            return (
              <div
                key={account.ad_account_id}
                className="rounded-lg border bg-card p-4 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all"
                onClick={() => handleSelectAccount(account.ad_account_id)}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-2.5 w-2.5 rounded-full ${healthConfig.bg} shrink-0`} />
                    <span className="text-sm font-semibold truncate">{account.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {account.active_alerts > 0 && (
                      <span className="flex items-center gap-0.5 text-xs bg-red-500/15 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded">
                        <Bell className="h-3 w-3" />
                        {account.active_alerts}
                      </span>
                    )}
                    <HealthIcon className={`h-4 w-4 ${healthConfig.color}`} />
                  </div>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Gasto</div>
                    <div className="text-sm font-bold font-mono">{formatCurrency(account.spend)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Conversoes</div>
                    <div className="text-sm font-bold font-mono">{formatNumber(account.conversions)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">CPA</div>
                    <div className="text-sm font-bold font-mono">{formatCurrency(account.cpa)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">CTR</div>
                    <div className="text-sm font-bold font-mono">{formatPercent(account.ctr)}</div>
                  </div>
                </div>

                {/* ROAS + Ads count */}
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                  <span>
                    ROAS: {account.roas != null ? `${account.roas.toFixed(1)}x` : '-'}
                  </span>
                  <span>{account.active_ads} anuncios ativos</span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {account.last_sync
                      ? `Sync ${timeAgo(account.last_sync)} atras`
                      : 'Nunca sincronizado'}
                  </span>
                  <span className="text-primary font-medium">Abrir →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
