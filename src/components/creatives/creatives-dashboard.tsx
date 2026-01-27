'use client';

import { useState, useEffect, useCallback } from 'react';
import { MetricsCards } from './metrics-cards';
import { DailyChart } from './daily-chart';
import { AdsTable } from './ads-table';
import { FiltersBar } from './filters-bar';
import { useCreativesData } from '@/lib/hooks/use-creatives-data';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle } from 'lucide-react';

interface Account {
  id: string;
  ad_account_id: string;
  name: string;
  status: string;
}

interface Campaign {
  campaign_id: string;
  name: string;
}

export function CreativesDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');

  const {
    summary,
    dailySeries,
    ads,
    loading,
    syncing,
    error,
    filters,
    setFilters,
    triggerSync,
  } = useCreativesData(selectedAccount);

  // Fetch accounts on mount
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch('/api/meta/accounts');
        if (res.ok) {
          const data = await res.json();
          setAccounts(data.accounts || []);
          if (data.accounts?.length > 0 && !selectedAccount) {
            const firstActive = data.accounts.find(
              (a: Account) => a.status === 'active'
            );
            if (firstActive) {
              setSelectedAccount(firstActive.ad_account_id);
              setFilters({ adAccountId: firstActive.ad_account_id });
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
      }
    }
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch campaigns when account changes
  useEffect(() => {
    if (!selectedAccount) return;
    async function fetchCampaigns() {
      try {
        const res = await fetch(`/api/meta/insights?ad_account_id=${selectedAccount}&date_start=2020-01-01&date_end=2099-12-31&type=campaigns`);
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data || []);
        }
      } catch {
        // Campaigns filter is optional, not critical
      }
    }
    fetchCampaigns();
  }, [selectedAccount]);

  const handleAccountChange = useCallback(
    (accountId: string) => {
      setSelectedAccount(accountId);
      setFilters({ adAccountId: accountId });
    },
    [setFilters]
  );

  const handleSort = useCallback(
    (column: string) => {
      if (filters.sortBy === column) {
        setFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' });
      } else {
        setFilters({ sortBy: column, sortDir: 'desc' });
      }
    },
    [filters.sortBy, filters.sortDir, setFilters]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Monitoramento de Criativos
          </h1>
          <p className="text-muted-foreground">
            Acompanhe o desempenho dos seus anuncios no Meta Ads.
          </p>
        </div>

        {accounts.length > 0 && (
          <Select value={selectedAccount} onValueChange={handleAccountChange}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Selecionar conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem
                  key={account.ad_account_id}
                  value={account.ad_account_id}
                >
                  {account.name || account.ad_account_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* No account state */}
      {accounts.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <h2 className="text-xl font-semibold">Nenhuma conta conectada</h2>
          <p className="mt-2 text-muted-foreground max-w-md">
            Conecte sua conta Meta Ads para comecar a monitorar seus criativos.
            Acesse as configuracoes para adicionar uma conta.
          </p>
        </div>
      )}

      {/* Dashboard content */}
      {selectedAccount && (
        <>
          {/* Filters */}
          <FiltersBar
            datePreset={filters.datePreset}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            search={filters.search}
            status={filters.status}
            campaignId={filters.campaignId}
            campaigns={campaigns}
            syncing={syncing}
            onDatePresetChange={(preset) => setFilters({ datePreset: preset })}
            onDateRangeChange={(from, to) =>
              setFilters({ datePreset: 'custom', dateFrom: from, dateTo: to })
            }
            onSearchChange={(search) => setFilters({ search })}
            onStatusChange={(status) => setFilters({ status })}
            onCampaignChange={(campaignId) => setFilters({ campaignId })}
            onSync={triggerSync}
          />

          {/* Metric Cards */}
          <MetricsCards summary={summary} loading={loading} />

          {/* Daily Chart */}
          <DailyChart data={dailySeries} loading={loading} />

          {/* Ads Table */}
          <AdsTable
            data={ads}
            loading={loading}
            sortBy={filters.sortBy}
            sortDir={filters.sortDir}
            onSort={handleSort}
            onPageChange={(page) => setFilters({ page })}
          />
        </>
      )}
    </div>
  );
}
