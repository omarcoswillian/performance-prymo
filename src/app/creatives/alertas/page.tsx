'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@/components/creatives/account-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Bell,
  AlertTriangle,
  TrendingDown,
  DollarSign,
  Radio,
  CheckCircle,
  Clock,
  Filter,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Alert {
  id: string;
  ad_account_id: string;
  ad_id: string;
  type: 'no_conversions' | 'ctr_fatigue' | 'high_cpa' | 'frequency_fatigue';
  message: string;
  severity: 'warning' | 'critical';
  created_at: string;
  resolved_at: string | null;
}

type AlertFilter = 'all' | 'active' | 'resolved';
type TypeFilter = 'all' | Alert['type'];
type SeverityFilter = 'all' | 'warning' | 'critical';

const TYPE_CONFIG: Record<Alert['type'], { label: string; icon: typeof Bell; color: string }> = {
  no_conversions: { label: 'Sem Conversoes', icon: DollarSign, color: 'text-red-500' },
  ctr_fatigue: { label: 'Fadiga CTR', icon: TrendingDown, color: 'text-amber-500' },
  high_cpa: { label: 'CPA Alto', icon: DollarSign, color: 'text-red-500' },
  frequency_fatigue: { label: 'Frequencia Alta', icon: Radio, color: 'text-amber-500' },
};

const SEVERITY_COLORS = {
  warning: 'border-amber-500/30 bg-amber-500/5',
  critical: 'border-red-500/30 bg-red-500/5',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m atras`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atras`;
  const days = Math.floor(hours / 24);
  return `${days}d atras`;
}

export default function AlertasPage() {
  const { selectedAccount } = useAccount();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AlertFilter>('active');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/meta/alerts?ad_account_id=${selectedAccount}&status=${statusFilter}`
      );
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, statusFilter]);

  useEffect(() => {
    setAlerts([]);
    fetchAlerts();
  }, [fetchAlerts]);

  const handleResolve = async (alertId: string) => {
    if (!selectedAccount) return;
    setResolvingId(alertId);
    try {
      const res = await fetch('/api/meta/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alertId, ad_account_id: selectedAccount }),
      });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        toast.success('Alerta resolvido');
      }
    } catch {
      toast.error('Erro ao resolver alerta');
    } finally {
      setResolvingId(null);
    }
  };

  const filteredAlerts = alerts.filter(a => {
    if (typeFilter !== 'all' && a.type !== typeFilter) return false;
    if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
    return true;
  });

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Alertas</h1>
          {!loading && (
            <div className="flex gap-2 text-xs">
              {criticalCount > 0 && (
                <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-700 dark:text-red-400">
                  {criticalCount} critico{criticalCount > 1 ? 's' : ''}
                </span>
              )}
              {warningCount > 0 && (
                <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                  {warningCount} aviso{warningCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Status:</span>
          {(['active', 'resolved', 'all'] as AlertFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                statusFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {f === 'active' ? 'Ativos' : f === 'resolved' ? 'Resolvidos' : 'Todos'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            Todos
          </button>
          {(Object.keys(TYPE_CONFIG) as Alert['type'][]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {TYPE_CONFIG[t].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Severidade:</span>
          {(['all', 'critical', 'warning'] as SeverityFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                severityFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {s === 'all' ? 'Todos' : s === 'critical' ? 'Critico' : 'Aviso'}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="h-10 w-10 mb-4 opacity-20" />
          <p className="text-sm font-medium">Nenhum alerta encontrado</p>
          <p className="text-xs mt-1">
            {statusFilter === 'active'
              ? 'Nenhum alerta ativo no momento. Tudo esta funcionando bem!'
              : 'Nenhum alerta corresponde aos filtros selecionados.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground mb-2">
            Mostrando {filteredAlerts.length} alerta{filteredAlerts.length > 1 ? 's' : ''}
          </div>
          {filteredAlerts.map(alert => {
            const config = TYPE_CONFIG[alert.type];
            const Icon = config.icon;
            const isResolved = !!alert.resolved_at;

            return (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border p-4 transition-colors',
                  isResolved
                    ? 'border-muted bg-muted/30 opacity-60'
                    : SEVERITY_COLORS[alert.severity]
                )}
              >
                <div className={cn('mt-0.5', config.color)}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'text-xs font-bold rounded px-1.5 py-0.5',
                      alert.severity === 'critical'
                        ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                    )}>
                      {alert.severity === 'critical' ? 'CRITICO' : 'AVISO'}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {config.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                      <Clock className="h-3 w-3" />
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>

                  <p className="text-sm">{alert.message}</p>

                  <div className="text-[10px] text-muted-foreground mt-1">
                    Ad: {alert.ad_id}
                  </div>
                </div>

                {!isResolved && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={() => handleResolve(alert.id)}
                    disabled={resolvingId === alert.id}
                  >
                    {resolvingId === alert.id ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <CheckCircle className="h-3 w-3 mr-1" />
                    )}
                    Resolver
                  </Button>
                )}

                {isResolved && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Resolvido
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
