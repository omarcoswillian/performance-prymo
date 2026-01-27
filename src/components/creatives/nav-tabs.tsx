'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Crosshair, Search, Globe, GitCompare, Calendar } from 'lucide-react';
import { useAccount, type PeriodDays } from '@/components/creatives/account-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const tabs = [
  { href: '/creatives', label: 'Comando', icon: Crosshair },
  { href: '/creatives/diagnostico', label: 'Diagnostico', icon: Search },
  { href: '/creatives/paginas', label: 'Paginas', icon: Globe },
  { href: '/creatives/alinhamento', label: 'Alinhamento', icon: GitCompare },
];

const periodOptions: { value: PeriodDays; label: string }[] = [
  { value: 7, label: '7 dias' },
  { value: 14, label: '14 dias' },
  { value: 30, label: '30 dias' },
];

export function NavTabs() {
  const pathname = usePathname();
  const { accounts, selectedAccount, setSelectedAccount, periodDays, setPeriodDays } = useAccount();

  return (
    <nav className="flex items-center justify-between border-b bg-background px-2">
      <div className="flex">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/creatives'
              ? pathname === '/creatives'
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mr-2">
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v) as PeriodDays)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {accounts.length > 0 && (
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.ad_account_id} value={a.ad_account_id}>
                  {a.name || a.ad_account_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </nav>
  );
}
