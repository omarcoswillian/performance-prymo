'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { format, subDays } from 'date-fns';

interface Account {
  id: string;
  ad_account_id: string;
  name: string;
}

export type PeriodDays = 7 | 14 | 30;

interface AccountContextValue {
  accounts: Account[];
  selectedAccount: string;
  setSelectedAccount: (id: string) => void;
  accountsLoaded: boolean;
  periodDays: PeriodDays;
  setPeriodDays: (days: PeriodDays) => void;
  dateStart: string;
  dateEnd: string;
}

const AccountContext = createContext<AccountContextValue>({
  accounts: [],
  selectedAccount: '',
  setSelectedAccount: () => {},
  accountsLoaded: false,
  periodDays: 7,
  setPeriodDays: () => {},
  dateStart: '',
  dateEnd: '',
});

const STORAGE_KEY = 'mc_selected_account';
const PERIOD_KEY = 'mc_period_days';

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccountState] = useState('');
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [periodDays, setPeriodDaysState] = useState<PeriodDays>(7);

  const { dateStart, dateEnd } = useMemo(() => ({
    dateEnd: format(new Date(), 'yyyy-MM-dd'),
    dateStart: format(subDays(new Date(), periodDays), 'yyyy-MM-dd'),
  }), [periodDays]);

  const setSelectedAccount = useCallback((id: string) => {
    setSelectedAccountState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const setPeriodDays = useCallback((days: PeriodDays) => {
    setPeriodDaysState(days);
    try { localStorage.setItem(PERIOD_KEY, String(days)); } catch {}
  }, []);

  useEffect(() => {
    // Restore persisted period
    try {
      const stored = localStorage.getItem(PERIOD_KEY);
      if (stored && [7, 14, 30].includes(Number(stored))) {
        setPeriodDaysState(Number(stored) as PeriodDays);
      }
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
      periodDays, setPeriodDays, dateStart, dateEnd,
    }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
