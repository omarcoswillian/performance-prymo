'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import type { DatePreset } from '@/types/database';

interface DateRangePickerProps {
  preset: DatePreset;
  from: Date;
  to: Date;
  onPresetChange: (preset: DatePreset) => void;
  onRangeChange: (from: Date, to: Date) => void;
}

const presets: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Custom' },
];

export function DateRangePicker({
  preset,
  from,
  to,
  onPresetChange,
  onRangeChange,
}: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-md border border-input bg-background">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => onPresetChange(p.value)}
            className={cn(
              'px-3 py-1.5 text-sm transition-colors first:rounded-l-md last:rounded-r-md',
              preset === p.value
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'justify-start text-left font-normal',
                !from && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {from ? (
                to ? (
                  <>
                    {format(from, 'dd/MM/yyyy', { locale: ptBR })} -{' '}
                    {format(to, 'dd/MM/yyyy', { locale: ptBR })}
                  </>
                ) : (
                  format(from, 'dd/MM/yyyy', { locale: ptBR })
                )
              ) : (
                'Selecionar periodo'
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from, to }}
              onSelect={(range) => {
                if (range?.from && range?.to) {
                  onRangeChange(range.from, range.to);
                }
              }}
              numberOfMonths={2}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
