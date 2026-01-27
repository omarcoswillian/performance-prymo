'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  MetricsSummary,
  DailySeries,
  PaginatedResponse,
  AdWithMetrics,
  DatePreset,
} from '@/types/database';
import { format, subDays } from 'date-fns';

interface Filters {
  adAccountId: string;
  datePreset: DatePreset;
  dateFrom: Date;
  dateTo: Date;
  campaignId: string | null;
  adsetId: string | null;
  status: string | null;
  search: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

interface CreativesData {
  summary: MetricsSummary | null;
  dailySeries: DailySeries[];
  ads: PaginatedResponse<AdWithMetrics> | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  filters: Filters;
  setFilters: (updates: Partial<Filters>) => void;
  refresh: () => void;
  triggerSync: () => Promise<void>;
}

const defaultFilters: Filters = {
  adAccountId: '',
  datePreset: '7d',
  dateFrom: subDays(new Date(), 7),
  dateTo: new Date(),
  campaignId: null,
  adsetId: null,
  status: null,
  search: '',
  sortBy: 'spend',
  sortDir: 'desc',
  page: 1,
  pageSize: 20,
};

export function getDateRange(preset: DatePreset, from?: Date, to?: Date) {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: now, to: now };
    case '7d':
      return { from: subDays(now, 7), to: now };
    case '30d':
      return { from: subDays(now, 30), to: now };
    case 'custom':
      return { from: from || subDays(now, 7), to: to || now };
  }
}

export function useCreativesData(
  initialAccountId?: string
): CreativesData {
  const [filters, setFiltersState] = useState<Filters>({
    ...defaultFilters,
    adAccountId: initialAccountId || '',
  });
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [dailySeries, setDailySeries] = useState<DailySeries[]>([]);
  const [ads, setAds] = useState<PaginatedResponse<AdWithMetrics> | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFilters = useCallback((updates: Partial<Filters>) => {
    setFiltersState((prev) => {
      const next = { ...prev, ...updates };
      // Update date range when preset changes
      if (updates.datePreset && updates.datePreset !== 'custom') {
        const range = getDateRange(updates.datePreset);
        next.dateFrom = range.from;
        next.dateTo = range.to;
      }
      // Reset page when filters change (except page itself)
      if (!('page' in updates)) {
        next.page = 1;
      }
      return next;
    });
  }, []);

  const fetchData = useCallback(async () => {
    if (!filters.adAccountId) return;

    setLoading(true);
    setError(null);

    const dateStart = format(filters.dateFrom, 'yyyy-MM-dd');
    const dateEnd = format(filters.dateTo, 'yyyy-MM-dd');
    const baseParams = new URLSearchParams({
      ad_account_id: filters.adAccountId,
      date_start: dateStart,
      date_end: dateEnd,
    });

    try {
      // Fetch summary, daily series, and ads in parallel
      const [summaryRes, dailyRes, adsRes] = await Promise.all([
        fetch(`/api/meta/insights?${baseParams}&type=summary`),
        fetch(`/api/meta/insights?${baseParams}&type=daily`),
        fetch(
          `/api/meta/insights?${baseParams}&type=ads` +
            `&sort_by=${filters.sortBy}&sort_dir=${filters.sortDir}` +
            `&page=${filters.page}&page_size=${filters.pageSize}` +
            (filters.campaignId
              ? `&campaign_id=${filters.campaignId}`
              : '') +
            (filters.adsetId ? `&adset_id=${filters.adsetId}` : '') +
            (filters.status ? `&status=${filters.status}` : '') +
            (filters.search ? `&search=${encodeURIComponent(filters.search)}` : '')
        ),
      ]);

      if (!summaryRes.ok || !dailyRes.ok || !adsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [summaryData, dailyData, adsData] = await Promise.all([
        summaryRes.json(),
        dailyRes.json(),
        adsRes.json(),
      ]);

      setSummary(summaryData);
      setDailySeries(dailyData || []);
      setAds(adsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const triggerSync = useCallback(async () => {
    if (!filters.adAccountId || syncing) return;

    setSyncing(true);
    try {
      const res = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_account_id: filters.adAccountId }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Sync failed');
      }

      // Refresh data after sync
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [filters.adAccountId, syncing, fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    summary,
    dailySeries,
    ads,
    loading,
    syncing,
    error,
    filters,
    setFilters,
    refresh: fetchData,
    triggerSync,
  };
}
