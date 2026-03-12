'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@/components/creatives/account-context';
import {
  type CreativeWithDecision,
  type DecisionSettings,
  DEFAULT_SETTINGS,
} from '@/lib/decision-engine';

export interface DailyTotal {
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
  ctr: number;
}

export interface CommandData {
  creatives: CreativeWithDecision[];
  dailyTotals: DailyTotal[];
  settings: DecisionSettings;
  ctrBenchmark: number;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  refresh: () => void;
  triggerSync: () => Promise<void>;
}

/**
 * Unified hook for all creative dashboard pages.
 * Fetches creatives with decisions already applied server-side,
 * along with daily totals, effective settings, and CTR benchmark.
 */
export function useCommandData(): CommandData {
  const { selectedAccount, dateStart, dateEnd } = useAccount();

  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [settings, setSettings] = useState<DecisionSettings>(DEFAULT_SETTINGS);
  const [ctrBenchmark, setCtrBenchmark] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=command`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Erro ao buscar dados');
      }
      const data = await res.json();
      setCreatives(data.creatives || []);
      setDailyTotals(data.daily_totals || []);
      setSettings(data.settings || DEFAULT_SETTINGS);
      setCtrBenchmark(data.ctr_benchmark ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd]);

  const triggerSync = useCallback(async () => {
    if (!selectedAccount || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/meta/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_account_id: selectedAccount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || 'Erro ao sincronizar';
        throw new Error(
          msg.includes('access token') || msg.includes('Session has expired')
            ? 'Token Meta expirado. Reconecte a conta em Configuracoes.'
            : msg
        );
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [selectedAccount, syncing, fetchData]);

  useEffect(() => {
    setCreatives([]);
    setDailyTotals([]);
    setCtrBenchmark(0);
    fetchData();
  }, [fetchData]);

  return {
    creatives,
    dailyTotals,
    settings,
    ctrBenchmark,
    loading,
    syncing,
    error,
    refresh: fetchData,
    triggerSync,
  };
}
