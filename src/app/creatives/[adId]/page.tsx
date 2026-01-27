'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, ImageIcon, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { MetaAd, DailySeries } from '@/types/database';

interface AdDetail extends MetaAd {
  meta_campaigns?: { name: string };
  meta_adsets?: { name: string };
}

export default function AdDetailPage({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const { adId } = use(params);
  const router = useRouter();
  const [ad, setAd] = useState<AdDetail | null>(null);
  const [dailyData, setDailyData] = useState<DailySeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState<string>('');

  useEffect(() => {
    async function fetchAccountAndData() {
      try {
        // Get account ID first
        const accountsRes = await fetch('/api/meta/accounts');
        if (!accountsRes.ok) return;
        const accountsData = await accountsRes.json();
        const account = accountsData.accounts?.[0];
        if (!account) return;

        setAccountId(account.ad_account_id);

        const dateEnd = format(new Date(), 'yyyy-MM-dd');
        const dateStart = format(subDays(new Date(), 30), 'yyyy-MM-dd');
        const baseParams = `ad_account_id=${account.ad_account_id}&date_start=${dateStart}&date_end=${dateEnd}`;

        const [adRes, dailyRes] = await Promise.all([
          fetch(
            `/api/meta/insights?${baseParams}&type=ad_detail&ad_id=${adId}`
          ),
          fetch(
            `/api/meta/insights?${baseParams}&type=daily&ad_id=${adId}`
          ),
        ]);

        if (adRes.ok) {
          const adData = await adRes.json();
          setAd(adData.ad);
        }

        if (dailyRes.ok) {
          const series = await dailyRes.json();
          setDailyData(series || []);
        }
      } catch (err) {
        console.error('Failed to fetch ad detail:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAccountAndData();
  }, [adId]);

  // Calculate period averages
  const avgSpend =
    dailyData.length > 0
      ? dailyData.reduce((s, d) => s + Number(d.spend), 0) / dailyData.length
      : 0;
  const avgCtr =
    dailyData.length > 0
      ? dailyData.reduce((s, d) => s + Number(d.ctr), 0) / dailyData.length
      : 0;
  const totalConversions = dailyData.reduce(
    (s, d) => s + Number(d.conversions),
    0
  );
  const totalSpend = dailyData.reduce((s, d) => s + Number(d.spend), 0);
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : null;

  // Compare last day vs average
  const lastDay = dailyData.length > 0 ? dailyData[dailyData.length - 1] : null;
  const lastDayCpa =
    lastDay && Number(lastDay.conversions) > 0
      ? Number(lastDay.spend) / Number(lastDay.conversions)
      : null;

  const cpaComparison =
    avgCpa && lastDayCpa
      ? ((avgCpa - lastDayCpa) / avgCpa) * 100
      : null;

  const chartData = dailyData.map((d) => ({
    ...d,
    date: format(parseISO(d.date), 'dd/MM', { locale: ptBR }),
    spend: Number(d.spend),
    clicks: Number(d.clicks),
    conversions: Number(d.conversions),
    ctr: Number(d.ctr),
    cpa: d.cpa ? Number(d.cpa) : null,
  }));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Anuncio nao encontrado.</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/creatives')}
        >
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/creatives')}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar para criativos
      </Button>

      {/* Ad Header */}
      <Card>
        <CardContent className="flex gap-6 pt-6">
          <div className="flex-shrink-0">
            {ad.thumbnail_url ? (
              <Image
                src={ad.thumbnail_url}
                alt={ad.name}
                width={120}
                height={120}
                className="rounded-lg object-cover"
                unoptimized
              />
            ) : (
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-lg bg-muted">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{ad.name}</h1>
              <Badge>{ad.status}</Badge>
              {ad.format !== 'unknown' && (
                <Badge variant="outline">{ad.format}</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Campanha:</span>{' '}
                {ad.meta_campaigns?.name || ad.campaign_id}
              </div>
              <div>
                <span className="text-muted-foreground">Conjunto:</span>{' '}
                {ad.meta_adsets?.name || ad.adset_id}
              </div>
              {ad.headline && (
                <div>
                  <span className="text-muted-foreground">Headline:</span>{' '}
                  {ad.headline}
                </div>
              )}
              {ad.cta && (
                <div>
                  <span className="text-muted-foreground">CTA:</span> {ad.cta}
                </div>
              )}
            </div>

            {ad.primary_text && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                {ad.primary_text}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Period Summary with Comparison */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Investimento Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalSpend)}
            </div>
            <p className="text-xs text-muted-foreground">
              Media/dia: {formatCurrency(avgSpend)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Conversoes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(totalConversions)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">CTR Medio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(avgCtr)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">CPA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgCpa)}</div>
            {cpaComparison !== null && (
              <div
                className={`flex items-center gap-1 text-xs ${
                  cpaComparison > 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {cpaComparison > 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3" />
                )}
                Ultimo dia {Math.abs(cpaComparison).toFixed(1)}%{' '}
                {cpaComparison > 0 ? 'melhor' : 'pior'} que a media
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Investimento e Conversoes</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis yAxisId="left" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="spend"
                    name="Investimento (R$)"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="conversions"
                    name="Conversoes"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                Sem dados
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CTR e CPA</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis yAxisId="left" fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="ctr"
                    name="CTR (%)"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cpa"
                    name="CPA (R$)"
                    stroke="hsl(var(--chart-4))"
                    strokeWidth={2}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center text-muted-foreground">
                Sem dados
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
