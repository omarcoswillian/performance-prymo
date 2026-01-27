'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, Search, Loader2 } from 'lucide-react';
import { DateRangePicker } from '@/components/shared/date-range-picker';
import type { DatePreset } from '@/types/database';

interface FiltersBarProps {
  datePreset: DatePreset;
  dateFrom: Date;
  dateTo: Date;
  search: string;
  status: string | null;
  campaignId: string | null;
  campaigns: Array<{ campaign_id: string; name: string }>;
  syncing: boolean;
  onDatePresetChange: (preset: DatePreset) => void;
  onDateRangeChange: (from: Date, to: Date) => void;
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string | null) => void;
  onCampaignChange: (campaignId: string | null) => void;
  onSync: () => void;
}

export function FiltersBar({
  datePreset,
  dateFrom,
  dateTo,
  search,
  status,
  campaignId,
  campaigns,
  syncing,
  onDatePresetChange,
  onDateRangeChange,
  onSearchChange,
  onStatusChange,
  onCampaignChange,
  onSync,
}: FiltersBarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <DateRangePicker
          preset={datePreset}
          from={dateFrom}
          to={dateTo}
          onPresetChange={onDatePresetChange}
          onRangeChange={onDateRangeChange}
        />

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar anuncio..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 w-[200px]"
          />
        </div>

        <Select
          value={status || 'all'}
          onValueChange={(v) => onStatusChange(v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="PAUSED">Pausado</SelectItem>
            <SelectItem value="ARCHIVED">Arquivado</SelectItem>
          </SelectContent>
        </Select>

        {campaigns.length > 0 && (
          <Select
            value={campaignId || 'all'}
            onValueChange={(v) => onCampaignChange(v === 'all' ? null : v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Campanha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas campanhas</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.campaign_id} value={c.campaign_id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Button onClick={onSync} disabled={syncing} variant="outline" size="sm">
        {syncing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
      </Button>
    </div>
  );
}
