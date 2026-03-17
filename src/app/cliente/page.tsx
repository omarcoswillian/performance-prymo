'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { StatusBadge } from '@/components/creatives/status-badge';
import { AdThumbnail } from '@/components/creatives/ad-thumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  ShoppingCart,
  Target,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Calendar,
  Wallet,
  BarChart3,
} from 'lucide-react';
import Image from 'next/image';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { format as fmtDate, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TZDate } from '@date-fns/tz';
import type { CreativeWithDecision } from '@/lib/decision-engine';

type PeriodPreset = '7' | '14' | '30';

function computeDates(preset: PeriodPreset) {
  const today = new TZDate(new Date(), 'America/Sao_Paulo');
  const days = parseInt(preset, 10);
  return {
    dateStart: fmtDate(subDays(today, days), 'yyyy-MM-dd'),
    dateEnd: fmtDate(today, 'yyyy-MM-dd'),
  };
}

export default function ClienteDashboard() {
  const [token, setToken] = useState<string | null>(null);
  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [dailyTotals, setDailyTotals] = useState<{ date: string; conversions: number; spend: number; cpa: number | null }[]>([]);
  const [clientLabel, setClientLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('7');

  const { dateStart, dateEnd } = useMemo(() => computeDates(periodPreset), [periodPreset]);

  useEffect(() => {
    const stored = localStorage.getItem('mc_client_token');
    if (!stored) {
      setError('Acesso nao autorizado. Use o link enviado pelo seu gestor.');
      setLoading(false);
      return;
    }
    setToken(stored);
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clients/data?token=${token}&date_start=${dateStart}&date_end=${dateEnd}`
      );
      if (res.status === 401) {
        localStorage.removeItem('mc_client_token');
        setError('Link expirado. Peca um novo ao seu gestor.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao carregar dados');
      }
      const data = await res.json();
      setCreatives(data.creatives || []);
      setDailyTotals(data.daily_totals || []);
      setClientLabel(data.client_label || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [token, dateStart, dateEnd]);

  useEffect(() => {
    if (token) {
      setCreatives([]);
      setDailyTotals([]);
      fetchData();
    }
  }, [token, fetchData]);

  // ── Compute totals ──
  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
  const totalConversions = creatives.reduce((s, c) => s + c.compras, 0);
  const totalConvValue = creatives.reduce((s, c) => s + c.conversion_value, 0);
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : null;
  const roas = totalSpend > 0 && totalConvValue > 0 ? totalConvValue / totalSpend : null;
  const lucro = totalConvValue - totalSpend;

  // Top creatives by conversions (what the client cares about)
  const topCreatives = creatives
    .filter(c => c.compras > 0)
    .sort((a, b) => b.compras - a.compras)
    .slice(0, 5);

  // Worst creatives: spent money but no results or very expensive
  const worstCreatives = creatives
    .filter(c => c.spend > 0)
    .sort((a, b) => {
      // Zero conversions with high spend first
      const wasteA = a.compras === 0 ? a.spend : 0;
      const wasteB = b.compras === 0 ? b.spend : 0;
      if (wasteB !== wasteA) return wasteB - wasteA;
      // Then by worst CPA
      const cpaA = a.cpa ?? 0;
      const cpaB = b.cpa ?? 0;
      return cpaB - cpaA;
    })
    .filter(c => c.compras === 0 || (c.cpa !== null && c.cpa > (cpa ?? 999) * 1.5))
    .slice(0, 5);

  // Chart data
  const chartData = dailyTotals.map(d => ({
    label: fmtDate(parseISO(d.date), 'dd/MM', { locale: ptBR }),
    vendas: d.conversions,
    investimento: Number(d.spend.toFixed(2)),
    cpa: d.cpa != null ? Number(d.cpa.toFixed(2)) : undefined,
  }));
  const hasCpa = chartData.some(d => d.cpa !== undefined);

  if (!token && error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <AlertTriangle className="h-10 w-10 text-red-500" />
          <h2 className="text-lg font-bold">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-icon-black.svg"
            alt="Monitor Criativo"
            width={32}
            height={32}
            className="shrink-0 rounded-md dark:hidden"
          />
          <Image
            src="/logo-icon-white.svg"
            alt="Monitor Criativo"
            width={32}
            height={32}
            className="shrink-0 rounded-md hidden dark:block"
          />
          <div>
            <h1 className="text-sm font-bold">{clientLabel || 'Meu Painel'}</h1>
            <p className="text-[10px] text-muted-foreground">Relatorio de Performance</p>
          </div>
        </div>
        <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="14">14 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto px-6 py-5">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* ── Hero metrics: the 4 things a client cares about ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricCard
            icon={ShoppingCart}
            label="Vendas"
            value={loading ? null : formatNumber(totalConversions)}
            highlight
          />
          <MetricCard
            icon={Wallet}
            label="Investimento"
            value={loading ? null : formatCurrency(totalSpend)}
          />
          <MetricCard
            icon={Target}
            label="Custo por Venda"
            value={loading ? null : formatCurrency(cpa)}
            sub={cpa !== null ? (cpa <= 50 ? 'Dentro do alvo' : 'Acima do alvo') : undefined}
            subColor={cpa !== null ? (cpa <= 50 ? 'text-emerald-600' : 'text-amber-600') : undefined}
          />
          <MetricCard
            icon={TrendingUp}
            label="Retorno (ROAS)"
            value={loading ? null : (roas !== null ? `${roas.toFixed(1)}x` : '-')}
            sub={roas !== null ? `Lucro: ${formatCurrency(lucro)}` : undefined}
            subColor={lucro > 0 ? 'text-emerald-600' : 'text-red-500'}
          />
        </div>

        {/* ── Revenue highlight ── */}
        {!loading && totalConvValue > 0 && (
          <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Faturamento gerado pelos anuncios</div>
                <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(totalConvValue)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {totalConversions} vendas nos ultimos {periodPreset} dias
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Para cada R$1 investido</div>
                <div className="text-3xl font-bold">
                  {roas !== null ? `R$${roas.toFixed(2)}` : '-'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">retornaram em vendas</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Charts side by side ── */}
        {!loading && chartData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Vendas por dia */}
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground mb-3">Vendas por Dia</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                  <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={25} />
                  <Tooltip formatter={((v: number) => [v, 'Vendas']) as never} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="vendas" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Custo por venda por dia */}
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground mb-3">Custo por Venda por Dia</div>
              {hasCpa ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={v => `R$${v}`} />
                    <Tooltip formatter={((v: number) => [formatCurrency(v), 'Custo/Venda']) as never} contentStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="cpa" name="Custo/Venda" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">
                  Sem vendas suficientes para calcular
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Top vs Piores — lado a lado ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Melhores */}
          <div className="rounded-lg border border-emerald-500/20 bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-500/10">
              <Trophy className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium">Anuncios que mais vendem</span>
            </div>
            <div className="px-4 py-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : topCreatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Nenhum anuncio com vendas no periodo.
                </div>
              ) : (
                <div className="space-y-2">
                  {topCreatives.map((c, idx) => (
                    <div key={c.ad_id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                      <span className="text-sm font-bold text-muted-foreground w-6">#{idx + 1}</span>
                      <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-semibold text-foreground">{c.compras} vendas</span>
                          {' '}&middot;{' '}
                          {formatCurrency(c.cpa)} por venda
                          {c.roas != null && (
                            <>
                              {' '}&middot;{' '}
                              <span className={c.roas >= 2 ? 'text-emerald-600 font-semibold' : ''}>
                                {c.roas.toFixed(1)}x
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold">{formatCurrency(c.spend)}</div>
                        <div className="text-[10px] text-muted-foreground">investido</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Piores */}
          <div className="rounded-lg border border-red-500/20 bg-card">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Anuncios com baixo resultado</span>
            </div>
            <div className="px-4 py-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : worstCreatives.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  Todos os anuncios estao performando bem!
                </div>
              ) : (
                <div className="space-y-2">
                  {worstCreatives.map((c, idx) => (
                    <div key={c.ad_id} className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                      <span className="text-sm font-bold text-muted-foreground w-6">#{idx + 1}</span>
                      <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{c.name}</div>
                        <div className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">
                          {c.compras === 0
                            ? `${formatCurrency(c.spend)} investido sem vendas`
                            : `${c.compras} venda${c.compras > 1 ? 's' : ''} a ${formatCurrency(c.cpa)} cada`
                          }
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-red-600">{formatCurrency(c.spend)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {c.compras === 0 ? 'sem retorno' : `${c.roas != null ? c.roas.toFixed(1) + 'x' : '-'}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── All creatives table (simplified for client) ── */}
        {!loading && creatives.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Todos os Anuncios</span>
              <span className="text-xs text-muted-foreground ml-auto">{creatives.length} anuncios</span>
            </div>
            <div className="rounded-md border overflow-auto mb-6">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-medium w-10"></th>
                    <th className="text-left px-3 py-2.5 font-medium">Anuncio</th>
                    <th className="text-right px-3 py-2.5 font-medium w-20">Vendas</th>
                    <th className="text-right px-3 py-2.5 font-medium w-28">Custo/Venda</th>
                    <th className="text-right px-3 py-2.5 font-medium w-24">Investido</th>
                    <th className="text-right px-3 py-2.5 font-medium w-20">ROAS</th>
                    <th className="text-center px-3 py-2.5 font-medium w-24">Situacao</th>
                  </tr>
                </thead>
                <tbody>
                  {creatives.map(c => {
                    const statusLabel: Record<string, string> = {
                      ESCALAR: 'Escalando',
                      VARIAR: 'Ajustando',
                      MATAR: 'Pausar',
                      APRENDENDO: 'Aprendendo',
                      'FORÇADO': 'Manual',
                    };
                    return (
                      <tr key={c.ad_id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2.5">
                          <AdThumbnail thumbnailUrl={c.thumbnail_url} adId={c.ad_id} size={28} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-xs font-medium truncate max-w-[250px]">{c.name}</div>
                        </td>
                        <td className="text-right px-3 py-2.5 font-mono text-xs font-bold">
                          {c.compras}
                        </td>
                        <td className="text-right px-3 py-2.5 font-mono text-xs">
                          {formatCurrency(c.cpa)}
                        </td>
                        <td className="text-right px-3 py-2.5 font-mono text-xs">
                          {formatCurrency(c.spend)}
                        </td>
                        <td className="text-right px-3 py-2.5 font-mono text-xs">
                          {c.roas != null ? (
                            <span className={c.roas >= 2 ? 'text-emerald-600 font-bold' : ''}>
                              {c.roas.toFixed(1)}x
                            </span>
                          ) : '-'}
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            c.status === 'ESCALAR' ? 'bg-emerald-500/15 text-emerald-700' :
                            c.status === 'APRENDENDO' ? 'bg-blue-500/15 text-blue-700' :
                            c.status === 'MATAR' ? 'bg-red-500/15 text-red-700' :
                            'bg-amber-500/15 text-amber-700'
                          }`}>
                            {statusLabel[c.status] || c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-4 pb-4 text-center text-xs text-muted-foreground">
          Powered by Monitor Criativo &middot; Dados atualizados diariamente
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  subColor,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  sub?: string;
  subColor?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${highlight ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      {value === null ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className={`text-2xl font-bold ${highlight ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
          {value}
        </div>
      )}
      {sub && <div className={`text-xs mt-1 ${subColor || 'text-muted-foreground'}`}>{sub}</div>}
    </div>
  );
}
