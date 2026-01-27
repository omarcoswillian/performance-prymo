'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, type PeriodPreset } from '@/components/creatives/account-context';
import { useTheme } from 'next-themes';
import { Calendar as CalendarIcon, Sun, Moon, CalendarRange } from 'lucide-react';
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
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

const presetOptions: { value: PeriodPreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: '7', label: '7 dias' },
  { value: '14', label: '14 dias' },
  { value: '30', label: '30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

export function TopHeader() {
  const {
    accounts,
    selectedAccount,
    setSelectedAccount,
    periodPreset,
    setPeriodPreset,
    periodLabel,
    dateStart,
    dateEnd,
    setCustomRange,
  } = useAccount();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [customOpen, setCustomOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>(undefined);

  const handlePresetChange = (val: string) => {
    if (val === 'custom') {
      // Initialize range from current dates
      setRange({
        from: dateStart ? parseISO(dateStart) : undefined,
        to: dateEnd ? parseISO(dateEnd) : undefined,
      });
      setCustomOpen(true);
    } else {
      setPeriodPreset(val as PeriodPreset);
    }
  };

  const handleCustomApply = useCallback(() => {
    if (range?.from && range?.to) {
      const start = format(range.from, 'yyyy-MM-dd');
      const end = format(range.to, 'yyyy-MM-dd');
      setCustomRange(start, end);
      setCustomOpen(false);
    }
  }, [range, setCustomRange]);

  const handleCustomCancel = useCallback(() => {
    setCustomOpen(false);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-2">
      {/* Active period label */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarIcon className="h-3 w-3" />
        <span>{periodLabel}</span>
        {periodPreset !== 'custom' && (
          <span className="opacity-50">
            ({dateStart.split('-').reverse().join('/')} — {dateEnd.split('-').reverse().join('/')})
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Period selector */}
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <div className="flex items-center gap-1">
            <Select
              value={periodPreset}
              onValueChange={handlePresetChange}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <CalendarIcon className="h-3 w-3 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodPreset === 'custom' && (
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-2">
                  <CalendarRange className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
            )}
          </div>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Periodo personalizado</div>
                  <div className="text-xs text-muted-foreground">Maximo 90 dias</div>
                </div>
                {range?.from && (
                  <div className="text-xs text-muted-foreground text-right">
                    {format(range.from, 'dd/MM/yyyy')}
                    {range.to ? ` — ${format(range.to, 'dd/MM/yyyy')}` : ' — ...'}
                  </div>
                )}
              </div>
              <Calendar
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
                  onClick={handleCustomCancel}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={handleCustomApply}
                  disabled={!range?.from || !range?.to}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Account selector */}
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

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={toggleTheme}
          title={mounted ? (theme === 'dark' ? 'Modo claro' : 'Modo escuro') : undefined}
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
