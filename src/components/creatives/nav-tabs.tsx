'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Crosshair, Search, Globe, GitCompare, Calendar, Sparkles, Check } from 'lucide-react';
import { useAccount, type PeriodPreset } from '@/components/creatives/account-context';
import { useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const tabs = [
  { href: '/creatives', label: 'Comando', icon: Crosshair },
  { href: '/creatives/diagnostico', label: 'Diagnostico', icon: Search },
  { href: '/creatives/paginas', label: 'Paginas', icon: Globe },
  { href: '/creatives/alinhamento', label: 'Alinhamento', icon: GitCompare },
  { href: '/creatives/destaques', label: 'Destaques', icon: Sparkles },
];

const periodOptions: { value: PeriodPreset; label: string }[] = [
  { value: '7', label: '7 dias' },
  { value: '14', label: '14 dias' },
  { value: '30', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

export function NavTabs() {
  const pathname = usePathname();
  const {
    accounts,
    selectedAccount,
    setSelectedAccount,
    periodPreset,
    setPeriodPreset,
    dateStart,
    dateEnd,
    setCustomRange,
  } = useAccount();

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const handlePresetChange = (val: string) => {
    if (val === 'custom') {
      setRange({
        from: dateStart ? parseISO(dateStart) : undefined,
        to: dateEnd ? parseISO(dateEnd) : undefined,
      });
      setPeriodPreset('custom');
      // Delay to let Radix Select fully close before opening Popover
      setTimeout(() => setCalendarOpen(true), 150);
    } else {
      setPeriodPreset(val as PeriodPreset);
    }
  };

  const handleApply = useCallback(() => {
    if (range?.from && range?.to) {
      setCustomRange(format(range.from, 'yyyy-MM-dd'), format(range.to, 'yyyy-MM-dd'));
      setCalendarOpen(false);
    }
  }, [range, setCustomRange]);

  // Resolve displayed value — for the Select we map 'custom' to show the date range
  const displayValue = periodPreset === 'custom'
    ? periodOptions.find(o => o.value === 'custom')!.label
    : periodOptions.find(o => o.value === periodPreset)?.label ?? periodPreset;

  // Show which preset matches among the short list
  const selectValue = periodOptions.some(o => o.value === periodPreset) ? periodPreset : 'custom';

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
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <div className="flex items-center gap-1">
            <Select value={selectValue} onValueChange={handlePresetChange}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-2">
                      {o.label}
                      {periodPreset === o.value && o.value !== 'custom' && (
                        <Check className="h-3 w-3" />
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodPreset === 'custom' && (
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                >
                  {dateStart && dateEnd
                    ? `${dateStart.split('-').reverse().join('/')} — ${dateEnd.split('-').reverse().join('/')}`
                    : 'Selecionar'}
                </Button>
              </PopoverTrigger>
            )}
          </div>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Periodo personalizado</div>
                  <div className="text-xs text-muted-foreground">Selecione o intervalo desejado</div>
                </div>
                {range?.from && (
                  <div className="text-xs text-muted-foreground text-right">
                    {format(range.from, 'dd/MM/yyyy', { locale: ptBR })}
                    {range.to ? ` — ${format(range.to, 'dd/MM/yyyy', { locale: ptBR })}` : ' — ...'}
                  </div>
                )}
              </div>
              <CalendarComponent
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                locale={ptBR}
                disabled={{ after: new Date() }}
                defaultMonth={range?.from}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setCalendarOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleApply}
                  disabled={!range?.from || !range?.to}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

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
