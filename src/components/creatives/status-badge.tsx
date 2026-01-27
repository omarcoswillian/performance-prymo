'use client';

import { cn } from '@/lib/utils';
import type { DecisionStatus } from '@/lib/decision-engine';

const statusConfig: Record<DecisionStatus, { bg: string; text: string; label: string }> = {
  ESCALAR: { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', label: 'ESCALAR' },
  VARIAR: { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400', label: 'VARIAR' },
  MATAR: { bg: 'bg-red-500/15', text: 'text-red-700 dark:text-red-400', label: 'MATAR' },
  'FORÇADO': { bg: 'bg-purple-500/15', text: 'text-purple-700 dark:text-purple-400', label: 'FORÇADO' },
};

export function StatusBadge({ status }: { status: DecisionStatus }) {
  const config = statusConfig[status] || statusConfig.VARIAR;
  return (
    <span className={cn('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide', config.bg, config.text)}>
      {config.label}
    </span>
  );
}
