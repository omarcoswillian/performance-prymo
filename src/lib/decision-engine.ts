/**
 * Decision Engine — Operational Status Calculator
 *
 * Campaign-type aware analysis:
 *
 * VENDAS (Sales):
 *   Primary: CPA + Vendas
 *   ESCALAR: CPA <= target AND vendas >= 1 AND freq < 2.2
 *            OR ROAS >= 3x AND vendas >= 1 (overrides CPA)
 *   MATAR:   CPA > 1.3x target OR (spend >= min AND vendas = 0)
 *            ROAS >= 2x protects from MATAR (downgrades to VARIAR)
 *   VARIAR:  CPA bom + CTR baixo (variar visual) OR freq >= 2.8 (fadiga)
 *   APRENDENDO: spend < min_spend (not enough data yet)
 *
 * CAPTURA (Leads):
 *   Primary: CPL + Leads
 *   ESCALAR: CPL <= target AND leads >= 1 AND freq < 2.2
 *   MATAR:   CPL > 1.3x target OR (spend >= min AND leads = 0)
 *   VARIAR:  CPL bom + CTR baixo (variar visual) OR freq >= 2.8 (fadiga)
 *   APRENDENDO: spend < min_spend (not enough data yet)
 *
 * CTR is NEVER a primary decision metric. It only indicates visual attraction.
 * FORÇADO: manual override (takes priority over all)
 */

export type DecisionStatus = 'ESCALAR' | 'VARIAR' | 'MATAR' | 'FORÇADO' | 'APRENDENDO';
export type CampaignType = 'VENDAS' | 'CAPTURA';

export interface DecisionSettings {
  cpa_target: number;
  cpl_target: number;
  ctr_benchmark: number;
  min_spend: number;
  frequency_warn: number;   // 2.2
  frequency_kill: number;   // 2.8
  cost_kill_multiplier: number; // 1.3
}

export interface CreativeMetrics {
  ad_id: string;
  name: string;
  thumbnail_url: string | null;
  format: string;
  primary_text: string | null;
  headline: string | null;
  cta: string | null;
  campaign_id: string;
  campaign_name: string;
  campaign_type: CampaignType;
  ctr: number;
  compras: number;       // conversions (vendas or leads depending on type)
  cpa: number | null;    // cost per conversion (CPA for vendas, CPL for captura)
  conversion_value: number;
  roas: number | null;   // return on ad spend
  reach: number;
  frequency: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  cpm: number | null;
  hook_rate: number | null; // clicks / impressions * 100 — visual attraction metric
}

export interface DailyMetrics {
  date: string;
  ctr: number;
  conversions: number;
  spend: number;
}

export interface ScoreBreakdown {
  cost_score: number;      // 0-40
  volume_score: number;    // 0-20
  ctr_score: number;       // 0-15
  frequency_score: number; // 0-15
  roas_score: number;      // 0-10
}

export interface CreativeWithDecision extends CreativeMetrics {
  status: DecisionStatus;
  status_reason: string;
  forced_status: string | null;
  override_note: string | null;
  score: number;
  score_breakdown: ScoreBreakdown;
}

export const DEFAULT_SETTINGS: DecisionSettings = {
  cpa_target: 50,
  cpl_target: 30,
  ctr_benchmark: 1.0,  // will be overridden by account avg
  min_spend: 20,
  frequency_warn: 2.2,
  frequency_kill: 2.8,
  cost_kill_multiplier: 1.3,
};

/**
 * Returns the appropriate cost target and labels based on campaign type.
 */
function getCostConfig(type: CampaignType, settings: DecisionSettings) {
  if (type === 'CAPTURA') {
    return {
      target: settings.cpl_target,
      label: 'CPL',
      convLabel: 'leads',
      convLabelSingular: 'lead',
    };
  }
  return {
    target: settings.cpa_target,
    label: 'CPA',
    convLabel: 'vendas',
    convLabelSingular: 'venda',
  };
}

/**
 * Detect declining trends over consecutive days.
 * Returns warning strings if 3+ consecutive days of decline detected.
 */
function detectTrends(recentDailyData?: DailyMetrics[]): string[] {
  const warnings: string[] = [];
  if (!recentDailyData || recentDailyData.length < 3) return warnings;

  // Sort by date ascending
  const sorted = [...recentDailyData].sort((a, b) => a.date.localeCompare(b.date));

  // Check CTR decline
  let ctrDeclineStreak = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ctr < sorted[i - 1].ctr) {
      ctrDeclineStreak++;
    } else {
      ctrDeclineStreak = 0;
    }
  }
  if (ctrDeclineStreak >= 3) {
    warnings.push(`CTR em queda por ${ctrDeclineStreak} dias consecutivos`);
  }

  // Check conversions decline
  let convDeclineStreak = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].conversions < sorted[i - 1].conversions) {
      convDeclineStreak++;
    } else {
      convDeclineStreak = 0;
    }
  }
  if (convDeclineStreak >= 3) {
    warnings.push(`Conversoes em queda por ${convDeclineStreak} dias consecutivos`);
  }

  return warnings;
}

export function calculateStatus(
  creative: CreativeMetrics,
  settings: DecisionSettings,
  forcedStatus?: string | null,
  recentDailyData?: DailyMetrics[]
): { status: DecisionStatus; reason: string } {
  // Manual override always wins
  if (forcedStatus) {
    return { status: 'FORÇADO', reason: `Override manual: ${forcedStatus}` };
  }

  const {
    ctr_benchmark,
    min_spend,
    frequency_warn,
    frequency_kill,
    cost_kill_multiplier,
  } = settings;

  const { ctr, compras, cpa, frequency, spend, campaign_type, roas } = creative;
  const { target, label, convLabel } = getCostConfig(campaign_type, settings);

  const costBad = cpa !== null && cpa > target * cost_kill_multiplier;
  const costGood = cpa !== null && cpa <= target;
  const freq = frequency ?? 0;
  const freqHigh = freq >= frequency_kill;
  const freqWarn = freq >= frequency_warn;
  const ctrLow = ctr < ctr_benchmark;
  const hasConversions = compras >= 1;
  const spentEnough = spend >= min_spend;

  // Trend warnings
  const trendWarnings = detectTrends(recentDailyData);
  const trendSuffix = trendWarnings.length > 0 ? ` | ${trendWarnings.join(', ')}` : '';

  // ── ROAS override for VENDAS: ROAS >= 3x always ESCALAR ──
  if (campaign_type === 'VENDAS' && roas !== null && roas >= 3 && hasConversions && !freqHigh) {
    return {
      status: 'ESCALAR',
      reason: `ROAS excelente (${roas.toFixed(1)}x) com ${compras} vendas${trendSuffix}`,
    };
  }

  // ── APRENDENDO: not enough spend to decide ──
  if (!spentEnough) {
    const progress = Math.min(100, Math.round((spend / min_spend) * 100));
    return {
      status: 'APRENDENDO',
      reason: `Gasto R$${spend.toFixed(2)} de R$${min_spend.toFixed(2)} minimo (${progress}%)${trendSuffix}`,
    };
  }

  // ── MATAR ──
  // ROAS >= 2x protects from MATAR for VENDAS (profitable despite high CPA)
  if (costBad) {
    if (campaign_type === 'VENDAS' && roas !== null && roas >= 2) {
      return {
        status: 'VARIAR',
        reason: `${label} alto (R$${cpa!.toFixed(2)}) mas ROAS positivo (${roas.toFixed(1)}x) - otimizar custo${trendSuffix}`,
      };
    }
    return {
      status: 'MATAR',
      reason: `${label} (R$${cpa!.toFixed(2)}) acima de ${cost_kill_multiplier}x o alvo (R$${(target * cost_kill_multiplier).toFixed(2)})${trendSuffix}`,
    };
  }
  // Spent enough but zero conversions
  if (spentEnough && compras === 0) {
    return {
      status: 'MATAR',
      reason: `R$${spend.toFixed(2)} gasto sem ${convLabel}${trendSuffix}`,
    };
  }

  // ── VARIAR (fadiga) ──
  if (freqHigh) {
    return {
      status: 'VARIAR',
      reason: `Frequencia alta (${freq.toFixed(1)}) - fadiga do criativo${trendSuffix}`,
    };
  }

  // ── ESCALAR ──
  if (hasConversions && (costGood || cpa === null) && !freqWarn) {
    return {
      status: 'ESCALAR',
      reason: `${label} e frequencia dentro dos limites${trendSuffix}`,
    };
  }

  // ── VARIAR: good cost but low CTR → visual adjustment needed ──
  if (hasConversions && costGood && ctrLow) {
    return {
      status: 'VARIAR',
      reason: `${label} bom mas CTR baixo (${ctr.toFixed(2)}%) - variar visual para melhorar atracao${trendSuffix}`,
    };
  }

  // ── VARIAR: frequency warning range ──
  if (hasConversions && freqWarn && !freqHigh) {
    return {
      status: 'VARIAR',
      reason: `Frequencia em alerta (${freq.toFixed(1)}) - considerar variacao${trendSuffix}`,
    };
  }

  return { status: 'VARIAR', reason: `Metricas mistas - analisar manualmente${trendSuffix}` };
}

export function calculateAccountBenchmarkCTR(
  creatives: CreativeMetrics[]
): number {
  const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = creatives.reduce((s, c) => s + c.clicks, 0);
  if (totalImpressions === 0) return 1.0;
  return (totalClicks / totalImpressions) * 100;
}

/**
 * Calculate median conversions across all creatives (for score normalization).
 */
export function calculateMedianConversions(creatives: CreativeMetrics[]): number {
  const sorted = [...creatives].map(c => c.compras).sort((a, b) => a - b);
  if (sorted.length === 0) return 1;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return Math.max(1, median);
}

/**
 * Calculate a performance score from 0 to 100 for a creative.
 */
export function calculateScore(
  creative: CreativeMetrics,
  settings: DecisionSettings,
  accountMedianConversions: number,
  accountCtr: number
): { score: number; breakdown: ScoreBreakdown } {
  const { target } = getCostConfig(creative.campaign_type, settings);

  // Cost score (0-40): ratio of target/actual
  let cost_score = 0;
  if (creative.compras > 0 && creative.cpa !== null && creative.cpa > 0) {
    const ratio = target / creative.cpa; // 1.0 = exactly on target, >1 = better
    cost_score = Math.min(40, Math.round(ratio * 40));
  }

  // Volume score (0-20): based on conversions relative to median
  let volume_score = 0;
  if (creative.compras > 0) {
    const ratio = creative.compras / accountMedianConversions;
    volume_score = Math.min(20, Math.round(ratio * 10)); // 2x median = max
  }

  // CTR score (0-15): ratio to account benchmark
  let ctr_score = 0;
  if (accountCtr > 0 && creative.ctr > 0) {
    const ratio = creative.ctr / accountCtr;
    ctr_score = Math.min(15, Math.round(ratio * 15));
  }

  // Frequency score (0-15): healthy frequency = 15, degrades as approaches kill
  let frequency_score = 15;
  const freq = creative.frequency ?? 0;
  if (freq >= settings.frequency_kill) {
    frequency_score = 0;
  } else if (freq >= settings.frequency_warn) {
    const range = settings.frequency_kill - settings.frequency_warn;
    const progress = (freq - settings.frequency_warn) / range;
    frequency_score = Math.round(15 * (1 - progress));
  }

  // ROAS score (0-10): only for VENDAS
  let roas_score = 0;
  if (creative.campaign_type === 'VENDAS' && creative.roas !== null && creative.roas > 0) {
    if (creative.roas >= 3) {
      roas_score = 10;
    } else {
      roas_score = Math.round((creative.roas / 3) * 10);
    }
  }

  const breakdown: ScoreBreakdown = {
    cost_score,
    volume_score,
    ctr_score,
    frequency_score,
    roas_score,
  };

  const score = Math.min(100, cost_score + volume_score + ctr_score + frequency_score + roas_score);

  return { score, breakdown };
}

export function applyDecisions(
  creatives: CreativeMetrics[],
  settings: DecisionSettings,
  overrides: Record<string, string>,
  recentDailyDataMap?: Record<string, DailyMetrics[]>
): CreativeWithDecision[] {
  // Calculate account CTR benchmark
  const accountCtrBenchmark = calculateAccountBenchmarkCTR(creatives);
  const effectiveSettings = {
    ...settings,
    ctr_benchmark: accountCtrBenchmark,
  };

  const accountMedianConversions = calculateMedianConversions(creatives);

  return creatives.map((c) => {
    const forcedStatus = overrides[c.ad_id] || null;
    const dailyData = recentDailyDataMap?.[c.ad_id];
    const { status, reason } = calculateStatus(c, effectiveSettings, forcedStatus, dailyData);
    const { score, breakdown } = calculateScore(c, effectiveSettings, accountMedianConversions, accountCtrBenchmark);
    return {
      ...c,
      status,
      status_reason: reason,
      forced_status: forcedStatus,
      override_note: null,
      score,
      score_breakdown: breakdown,
    };
  });
}

/**
 * Generate diagnostic text adapted to campaign type
 */
export function generateDiagnosticText(
  creative: CreativeMetrics,
  settings: DecisionSettings,
  accountCtr: number
): string {
  const parts: string[] = [];
  const { target, label, convLabel } = getCostConfig(creative.campaign_type, settings);

  // Primary metric analysis (CPA or CPL)
  if (creative.compras > 0 && creative.cpa !== null) {
    if (creative.cpa <= target) {
      parts.push(`${label} (R$${creative.cpa.toFixed(2)}) dentro do alvo (R$${target.toFixed(2)})`);
    } else if (creative.cpa > target * settings.cost_kill_multiplier) {
      parts.push(`${label} (R$${creative.cpa.toFixed(2)}) muito acima do alvo (R$${target.toFixed(2)})`);
    } else {
      parts.push(`${label} (R$${creative.cpa.toFixed(2)}) acima do alvo (R$${target.toFixed(2)})`);
    }
  }

  if (creative.compras === 0 && creative.spend > settings.min_spend) {
    parts.push(`gastou R$${creative.spend.toFixed(2)} sem ${convLabel}`);
  }

  // ROAS insight for VENDAS
  if (creative.campaign_type === 'VENDAS' && creative.roas !== null && creative.roas > 0) {
    if (creative.roas >= 3) {
      parts.push(`ROAS excelente (${creative.roas.toFixed(1)}x) - alto retorno sobre investimento`);
    } else if (creative.roas >= 2) {
      parts.push(`ROAS positivo (${creative.roas.toFixed(1)}x) - lucrativo`);
    } else if (creative.roas < 1) {
      parts.push(`ROAS negativo (${creative.roas.toFixed(1)}x) - gasto maior que receita`);
    }
  }

  // Visual attraction analysis (CTR as secondary)
  if (creative.ctr < accountCtr) {
    parts.push(`CTR (${creative.ctr.toFixed(2)}%) abaixo da media da conta (${accountCtr.toFixed(2)}%) - atracao visual baixa`);
  } else {
    parts.push(`CTR (${creative.ctr.toFixed(2)}%) acima da media da conta (${accountCtr.toFixed(2)}%) - boa atracao visual`);
  }

  if (creative.cpm !== null && creative.cpm > 50) {
    parts.push(`CPM elevado (R$${creative.cpm.toFixed(2)})`);
  }

  if (creative.frequency != null && creative.frequency >= settings.frequency_warn) {
    parts.push(`frequencia alta (${creative.frequency.toFixed(1)})`);
  }

  if (parts.length === 0) {
    return 'Este criativo esta dentro dos parametros esperados.';
  }

  // Determine overall assessment based on primary metric
  const hasPrimaryGood = creative.compras > 0 && (creative.cpa === null || creative.cpa <= target);
  const prefix = hasPrimaryGood
    ? 'Este criativo performou bem'
    : 'Este criativo performou mal';

  return `${prefix}: ${parts.join('. ')}.`;
}
