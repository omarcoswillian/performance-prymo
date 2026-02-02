/**
 * Decision Engine — Operational Status Calculator
 *
 * Campaign-type aware analysis:
 *
 * VENDAS (Sales):
 *   Primary: CPA + Vendas
 *   ESCALAR: CPA <= target AND vendas >= 1 AND freq < 2.2
 *   MATAR:   CPA > 1.3x target OR (spend >= min AND vendas = 0)
 *   VARIAR:  CPA bom + CTR baixo (variar visual) OR freq >= 2.8 (fadiga)
 *
 * CAPTURA (Leads):
 *   Primary: CPL + Leads
 *   ESCALAR: CPL <= target AND leads >= 1 AND freq < 2.2
 *   MATAR:   CPL > 1.3x target OR (spend >= min AND leads = 0)
 *   VARIAR:  CPL bom + CTR baixo (variar visual) OR freq >= 2.8 (fadiga)
 *
 * CTR is NEVER a primary decision metric. It only indicates visual attraction.
 * FORÇADO: manual override (takes priority over all)
 */

export type DecisionStatus = 'ESCALAR' | 'VARIAR' | 'MATAR' | 'FORÇADO';
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
  campaign_id: string;
  campaign_name: string;
  campaign_type: CampaignType;
  ctr: number;
  compras: number;       // conversions (vendas or leads depending on type)
  cpa: number | null;    // cost per conversion (CPA for vendas, CPL for captura)
  frequency: number;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  cpm: number | null;
  hook_rate: number | null; // clicks / impressions * 100 — visual attraction metric
}

export interface CreativeWithDecision extends CreativeMetrics {
  status: DecisionStatus;
  status_reason: string;
  forced_status: string | null;
  override_note: string | null;
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

export function calculateStatus(
  creative: CreativeMetrics,
  settings: DecisionSettings,
  forcedStatus?: string | null
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

  const { ctr, compras, cpa, frequency, spend, campaign_type } = creative;
  const { target, label, convLabel } = getCostConfig(campaign_type, settings);

  const costBad = cpa !== null && cpa > target * cost_kill_multiplier;
  const costGood = cpa !== null && cpa <= target;
  const freqHigh = frequency >= frequency_kill;
  const freqWarn = frequency >= frequency_warn;
  const ctrLow = ctr < ctr_benchmark;
  const hasConversions = compras >= 1;
  const spentEnough = spend >= min_spend;

  // ── MATAR ──
  // Primary metric bad: cost per conversion too high
  if (costBad) {
    return {
      status: 'MATAR',
      reason: `${label} (R$${cpa!.toFixed(2)}) acima de ${cost_kill_multiplier}x o alvo (R$${(target * cost_kill_multiplier).toFixed(2)})`,
    };
  }
  // Spent enough but zero conversions
  if (spentEnough && compras === 0) {
    return {
      status: 'MATAR',
      reason: `R$${spend.toFixed(2)} gasto sem ${convLabel}`,
    };
  }

  // ── VARIAR (fadiga) ──
  if (freqHigh) {
    return {
      status: 'VARIAR',
      reason: `Frequencia alta (${frequency.toFixed(1)}) - fadiga do criativo`,
    };
  }

  // ── ESCALAR ──
  if (hasConversions && (costGood || cpa === null) && !freqWarn) {
    return {
      status: 'ESCALAR',
      reason: `${label} e frequencia dentro dos limites`,
    };
  }

  // ── VARIAR: good cost but low CTR → visual adjustment needed ──
  if (hasConversions && costGood && ctrLow) {
    return {
      status: 'VARIAR',
      reason: `${label} bom mas CTR baixo (${ctr.toFixed(2)}%) - variar visual para melhorar atracao`,
    };
  }

  // ── VARIAR: frequency warning range ──
  if (hasConversions && freqWarn && !freqHigh) {
    return {
      status: 'VARIAR',
      reason: `Frequencia em alerta (${frequency.toFixed(1)}) - considerar variacao`,
    };
  }

  // Not enough data to decide
  if (!spentEnough) {
    return {
      status: 'VARIAR',
      reason: `Gasto insuficiente (R$${spend.toFixed(2)}) para decisao`,
    };
  }

  return { status: 'VARIAR', reason: 'Metricas mistas - analisar manualmente' };
}

export function calculateAccountBenchmarkCTR(
  creatives: CreativeMetrics[]
): number {
  const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = creatives.reduce((s, c) => s + c.clicks, 0);
  if (totalImpressions === 0) return 1.0;
  return (totalClicks / totalImpressions) * 100;
}

export function applyDecisions(
  creatives: CreativeMetrics[],
  settings: DecisionSettings,
  overrides: Record<string, string>
): CreativeWithDecision[] {
  // Calculate account CTR benchmark
  const accountCtrBenchmark = calculateAccountBenchmarkCTR(creatives);
  const effectiveSettings = {
    ...settings,
    ctr_benchmark: accountCtrBenchmark,
  };

  return creatives.map((c) => {
    const forcedStatus = overrides[c.ad_id] || null;
    const { status, reason } = calculateStatus(c, effectiveSettings, forcedStatus);
    return {
      ...c,
      status,
      status_reason: reason,
      forced_status: forcedStatus,
      override_note: null,
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

  // Visual attraction analysis (CTR as secondary)
  if (creative.ctr < accountCtr) {
    parts.push(`CTR (${creative.ctr.toFixed(2)}%) abaixo da media da conta (${accountCtr.toFixed(2)}%) - atracao visual baixa`);
  } else {
    parts.push(`CTR (${creative.ctr.toFixed(2)}%) acima da media da conta (${accountCtr.toFixed(2)}%) - boa atracao visual`);
  }

  if (creative.cpm !== null && creative.cpm > 50) {
    parts.push(`CPM elevado (R$${creative.cpm.toFixed(2)})`);
  }

  if (creative.frequency >= settings.frequency_warn) {
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
