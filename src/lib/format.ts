/**
 * Formatting utilities for the dashboard.
 */

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null) return '-';
  return `${value.toFixed(2)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value);
}
