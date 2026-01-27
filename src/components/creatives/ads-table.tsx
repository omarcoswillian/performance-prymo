'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ImageIcon,
} from 'lucide-react';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import type { PaginatedResponse, AdWithMetrics } from '@/types/database';

interface AdsTableProps {
  data: PaginatedResponse<AdWithMetrics> | null;
  loading: boolean;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
  onPageChange: (page: number) => void;
}

const columns = [
  { key: 'preview', label: '', sortable: false },
  { key: 'name', label: 'Anuncio', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'spend', label: 'Investimento', sortable: true },
  { key: 'impressions', label: 'Impressoes', sortable: true },
  { key: 'clicks', label: 'Cliques', sortable: true },
  { key: 'ctr', label: 'CTR', sortable: true },
  { key: 'conversions', label: 'Conv.', sortable: true },
  { key: 'cpa', label: 'CPA', sortable: true },
];

function SortIcon({
  column,
  currentSort,
  currentDir,
}: {
  column: string;
  currentSort: string;
  currentDir: string;
}) {
  if (column !== currentSort) return <ChevronsUpDown className="h-3 w-3" />;
  return currentDir === 'asc' ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

function statusBadgeVariant(
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'ACTIVE':
      return 'default';
    case 'PAUSED':
      return 'secondary';
    case 'ARCHIVED':
    case 'DELETED':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function AdsTable({
  data,
  loading,
  sortBy,
  sortDir,
  onSort,
  onPageChange,
}: AdsTableProps) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Nenhum anuncio encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={col.sortable ? 'cursor-pointer select-none' : ''}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <SortIcon
                        column={col.key}
                        currentSort={sortBy}
                        currentDir={sortDir}
                      />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((ad) => (
              <TableRow
                key={ad.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/creatives/${ad.ad_id}`)}
              >
                <TableCell className="w-12">
                  {ad.thumbnail_url ? (
                    <Image
                      src={ad.thumbnail_url}
                      alt={ad.name}
                      width={40}
                      height={40}
                      className="rounded object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="max-w-[200px]">
                    <div className="font-medium truncate">{ad.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {ad.campaign_name} / {ad.adset_name}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(ad.status)}>
                    {ad.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {formatCurrency(ad.total_spend)}
                </TableCell>
                <TableCell>{formatNumber(ad.total_impressions)}</TableCell>
                <TableCell>{formatNumber(ad.total_clicks)}</TableCell>
                <TableCell>{formatPercent(ad.calc_ctr)}</TableCell>
                <TableCell>{formatNumber(ad.total_conversions)}</TableCell>
                <TableCell>{formatCurrency(ad.calc_cpa)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {(data.page - 1) * data.page_size + 1}-
          {Math.min(data.page * data.page_size, data.total)} de {data.total}{' '}
          anuncios
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(data.page - 1)}
            disabled={data.page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            {data.page} / {data.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(data.page + 1)}
            disabled={data.page >= data.total_pages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
