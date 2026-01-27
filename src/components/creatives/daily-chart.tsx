'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DailySeries } from '@/types/database';

interface DailyChartProps {
  data: DailySeries[];
  loading: boolean;
}

export function DailyChart({ data, loading }: DailyChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    date: format(parseISO(d.date), 'dd/MM', { locale: ptBR }),
    spend: Number(d.spend),
    conversions: Number(d.conversions),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Investimento e Conversoes por Dia</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            Nenhum dado disponivel para o periodo selecionado.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="left"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, name) => {
                  const v = Number(value);
                  if (name === 'Investimento') return formatCurrency(v);
                  return v;
                }}
                labelClassName="font-medium"
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="spend"
                name="Investimento"
                fill="hsl(var(--chart-1))"
                radius={[4, 4, 0, 0]}
                opacity={0.8}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="conversions"
                name="Conversoes"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
