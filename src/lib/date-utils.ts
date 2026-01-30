import { format, subDays } from 'date-fns';
import { TZDate } from '@date-fns/tz';

const TIMEZONE = 'America/Sao_Paulo';

export type DatePreset = 'today' | 'yesterday' | '7' | '14' | '30';

/**
 * Central date range resolver. Always uses America/Sao_Paulo timezone.
 * All dates returned as YYYY-MM-DD strings (inclusive range).
 */
export function resolveDateRange(
  preset: DatePreset | number,
  timezone: string = TIMEZONE
): { dateStart: string; dateEnd: string } {
  const today = new TZDate(new Date(), timezone);
  const todayStr = format(today, 'yyyy-MM-dd');

  if (preset === 'today') {
    return { dateStart: todayStr, dateEnd: todayStr };
  }

  if (preset === 'yesterday') {
    const y = format(subDays(today, 1), 'yyyy-MM-dd');
    return { dateStart: y, dateEnd: y };
  }

  const days = typeof preset === 'number' ? preset : parseInt(preset, 10);
  return {
    dateStart: format(subDays(today, days), 'yyyy-MM-dd'),
    dateEnd: todayStr,
  };
}
