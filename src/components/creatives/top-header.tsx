'use client';

import { useState } from 'react';
import { useAccount, type PeriodPreset } from '@/components/creatives/account-context';
import { useTheme } from 'next-themes';
import { Calendar, Sun, Moon, CalendarRange } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

  const [customOpen, setCustomOpen] = useState(false);
  const [tmpStart, setTmpStart] = useState(dateStart);
  const [tmpEnd, setTmpEnd] = useState(dateEnd);

  const handlePresetChange = (val: string) => {
    if (val === 'custom') {
      setTmpStart(dateStart);
      setTmpEnd(dateEnd);
      setCustomOpen(true);
    } else {
      setPeriodPreset(val as PeriodPreset);
    }
  };

  const handleCustomApply = () => {
    if (tmpStart && tmpEnd && tmpStart <= tmpEnd) {
      setCustomRange(tmpStart, tmpEnd);
      setCustomOpen(false);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="flex items-center justify-between border-b bg-background px-4 py-2">
      {/* Active period label */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-3 w-3" />
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
                <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
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
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3">
              <div className="text-sm font-medium">Periodo personalizado</div>
              <div className="text-xs text-muted-foreground">Maximo 90 dias</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Inicio</Label>
                  <Input
                    type="date"
                    value={tmpStart}
                    onChange={(e) => setTmpStart(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">Fim</Label>
                  <Input
                    type="date"
                    value={tmpEnd}
                    onChange={(e) => setTmpEnd(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={handleCustomApply}
                disabled={!tmpStart || !tmpEnd || tmpStart > tmpEnd}
              >
                Aplicar
              </Button>
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
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
        >
          <Sun className="h-3.5 w-3.5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </header>
  );
}
