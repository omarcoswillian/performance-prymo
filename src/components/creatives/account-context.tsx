'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { format, subDays, differenceInDays, parseISO } from 'date-fns';
import { TZDate } from '@date-fns/tz';

interface Account {
  id: string;
  ad_account_id: string;
  name: string;
}

export type PeriodPreset = 'today' | 'yesterday' | '7' | '14' | '30' | 'custom';

// Keep backward compat alias
export type PeriodDays = 7 | 14 | 30;

interface AccountContextValue {
  accounts: Account[];
  selectedAccount: string;
  setSelectedAccount: (id: string) => void;
  accountsLoaded: boolean;
  // Period
  periodPreset: PeriodPreset;
  setPeriodPreset: (p: PeriodPreset) => void;
  dateStart: string;
  dateEnd: string;
  setCustomRange: (start: string, end: string) => void;
  periodLabel: string;
  // Previous period (for trend comparison)
  prevDateStart: string;
  prevDateEnd: string;
  // Backward compat
  periodDays: PeriodDays;
  setPeriodDays: (days: PeriodDays) => void;
}

const AccountContext = createContext<AccountContextValue>({
  accounts: [],
  selectedAccount: '',
  setSelectedAccount: () => {},
  accountsLoaded: false,
  periodPreset: '7',
  setPeriodPreset: () => {},
  dateStart: '',
  dateEnd: '',
  setCustomRange: () => {},
  periodLabel: '',
  prevDateStart: '',
  prevDateEnd: '',
  periodDays: 7,
  setPeriodDays: () => {},
});

const STORAGE_KEY = 'mc_selected_account';
const PERIOD_KEY = 'mc_period_preset';
const CUSTOM_START_KEY = 'mc_custom_start';
const CUSTOM_END_KEY = 'mc_custom_end';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  yesterday: 'Ontem',
  '7': '7 dias',
  '14': '14 dias',
  '30': '30 dias',
  custom: 'Personalizado',
};

const VALID_PRESETS: PeriodPreset[] = ['today', 'yesterday', '7', '14', '30', 'custom'];

function computeDates(preset: PeriodPreset, customStart: string, customEnd: string) {
  // Use Brazil timezone to ensure "today" is correct for -03:00 users
  const today = new TZDate(new Date(), 'America/Sao_Paulo');
  const todayStr = format(today, 'yyyy-MM-dd');

  let dateStart: string;
  let dateEnd: string;

  switch (preset) {
    case 'today':
      dateStart = todayStr;
      dateEnd = todayStr;
      break;
    case 'yesterday': {
      const y = format(subDays(today, 1), 'yyyy-MM-dd');
      dateStart = y;
      dateEnd = y;
      break;
    }
    case '7':
      dateStart = format(subDays(today, 7), 'yyyy-MM-dd');
      dateEnd = todayStr;
      break;
    case '14':
      dateStart = format(subDays(today, 14), 'yyyy-MM-dd');
      dateEnd = todayStr;
      break;
    case '30':
      dateStart = format(subDays(today, 30), 'yyyy-MM-dd');
      dateEnd = todayStr;
      break;
    case 'custom':
      dateStart = customStart || format(subDays(today, 7), 'yyyy-MM-dd');
      dateEnd = customEnd || todayStr;
      break;
    default:
      dateStart = format(subDays(today, 7), 'yyyy-MM-dd');
      dateEnd = todayStr;
  }

  // Previous period: same duration, ending the day before dateStart
  const daysBetween = differenceInDays(parseISO(dateEnd), parseISO(dateStart)) + 1;
  const prevEnd = format(subDays(parseISO(dateStart), 1), 'yyyy-MM-dd');
  const prevStart = format(subDays(parseISO(dateStart), daysBetween), 'yyyy-MM-dd');

  // Period label
  let periodLabel: string;
  if (preset === 'custom') {
    periodLabel = `${dateStart.split('-').reverse().join('/')} — ${dateEnd.split('-').reverse().join('/')}`;
  } else {
    periodLabel = PRESET_LABELS[preset];
  }

  return { dateStart, dateEnd, prevDateStart: prevStart, prevDateEnd: prevEnd, periodLabel };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState('');
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [periodPreset, setPeriodPresetState] = useState<PeriodPreset>('7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { dateStart, dateEnd, prevDateStart, prevDateEnd, periodLabel } = useMemo(
    () => computeDates(periodPreset, customStart, customEnd),
    [periodPreset, customStart, customEnd]
  );

  const setSelectedAccount = useCallback((id: string) => {
    setSelectedAccountState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const setPeriodPreset = useCallback((p: PeriodPreset) => {
    setPeriodPresetState(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch {}
  }, []);

  const setCustomRange = useCallback((start: string, end: string) => {
    // Clamp to max 90 days
    const diff = differenceInDays(parseISO(end), parseISO(start));
    const clampedStart = diff > 90 ? format(subDays(parseISO(end), 90), 'yyyy-MM-dd') : start;
    setCustomStart(clampedStart);
    setCustomEnd(end);
    setPeriodPresetState('custom');
    try {
      localStorage.setItem(PERIOD_KEY, 'custom');
      localStorage.setItem(CUSTOM_START_KEY, clampedStart);
      localStorage.setItem(CUSTOM_END_KEY, end);
    } catch {}
  }, []);

  // Backward compat
  const periodDays: PeriodDays = periodPreset === '14' ? 14 : periodPreset === '30' ? 30 : 7;
  const setPeriodDays = useCallback((days: PeriodDays) => {
    setPeriodPreset(String(days) as PeriodPreset);
  }, [setPeriodPreset]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERIOD_KEY);
      if (stored && VALID_PRESETS.includes(stored as PeriodPreset)) {
        setPeriodPresetState(stored as PeriodPreset);
      }
      const cs = localStorage.getItem(CUSTOM_START_KEY);
      const ce = localStorage.getItem(CUSTOM_END_KEY);
      if (cs) setCustomStart(cs);
      if (ce) setCustomEnd(ce);
    } catch {}
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/meta/accounts');
        if (!res.ok) return;
        const data = await res.json();
        const list: Account[] = data.accounts || [];
        setAccounts(list);

        let stored = '';
        try { stored = localStorage.getItem(STORAGE_KEY) || ''; } catch {}

        const valid = list.find(a => a.ad_account_id === stored);
        if (valid) {
          setSelectedAccountState(stored);
        } else if (list.length > 0) {
          const first = list.find(a => a.name && !a.name.includes('Read-Only')) || list[0];
          setSelectedAccount(first.ad_account_id);
        }
      } finally {
        setAccountsLoaded(true);
      }
    }
    load();
  }, [setSelectedAccount]);

  return (
    <AccountContext.Provider value={{
      accounts, selectedAccount, setSelectedAccount, accountsLoaded,
      periodPreset, setPeriodPreset,
      dateStart, dateEnd, setCustomRange,
      periodLabel,
      prevDateStart, prevDateEnd,
      periodDays, setPeriodDays,
    }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
