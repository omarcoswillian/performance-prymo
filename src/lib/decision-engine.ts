/**
 * Decision Engine — Operational Status Calculator
 *
 * Rules:
 * ESCALAR: CTR >= benchmark AND compras >= 1 AND CPA <= target AND freq < 2.2
 * VARIAR:  (CTR good AND compras = 0 AND spend >= min) OR freq >= 2.8
 * MATAR:   CTR < benchmark OR CPA > 1.3x target
 * FORÇADO: manual override (takes priority over all)
 */

export type DecisionStatus = 'ESCALAR' | 'VARIAR' | 'MATAR' | 'FORÇADO';

export interface DecisionSettings {
  cpa_target: number;
  ctr_benchmark: number;
  min_spend: number;
  frequency_warn: number;   // 2.2
  frequency_kill: number;   // 2.8
  cpa_kill_multiplier: number; // 1.3
}

export interface CreativeMetrics {
  ad_id: string;
  name: string;
  thumbnail_url: string | null;
  format: string;
  campaign_id: string;
  campaign_name: string;
  ctr: number;
  compras: number;
  cpa: number | null;
  frequency: number;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  cpm: number | null;
}

export interface CreativeWithDecision extends CreativeMetrics {
  status: DecisionStatus;
  status_reason: string;
  forced_status: string | null;
  override_note: string | null;
}

export const DEFAULT_SETTINGS: DecisionSettings = {
  cpa_target: 50,
  ctr_benchmark: 1.0,  // will be overridden by account avg
  min_spend: 20,
  frequency_warn: 2.2,
  frequency_kill: 2.8,
  cpa_kill_multiplier: 1.3,
};

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
    cpa_target,
    ctr_benchmark,
    min_spend,
    frequency_warn,
    frequency_kill,
    cpa_kill_multiplier,
  } = settings;

  const { ctr, compras, cpa, frequency, spend } = creative;

  const ctrGood = ctr >= ctr_benchmark;
  const ctrBad = ctr < ctr_benchmark;
  const cpaBad = cpa !== null && cpa > cpa_target * cpa_kill_multiplier;
  const freqHigh = frequency >= frequency_kill;
  const freqWarn = frequency >= frequency_warn;

  // MATAR: CTR ruim OR CPA > 1.3x alvo
  if (ctrBad && spend >= min_spend) {
    return { status: 'MATAR', reason: `CTR (${ctr.toFixed(2)}%) abaixo do benchmark (${ctr_benchmark.toFixed(2)}%)` };
  }
  if (cpaBad) {
    return { status: 'MATAR', reason: `CPA (R$${cpa!.toFixed(2)}) acima de ${cpa_kill_multiplier}x o alvo (R$${(cpa_target * cpa_kill_multiplier).toFixed(2)})` };
  }

  // VARIAR (fadiga): frequência >= 2.8
  if (freqHigh) {
    return { status: 'VARIAR', reason: `Frequencia alta (${frequency.toFixed(1)}) - fadiga do criativo` };
  }

  // VARIAR (ajustar promessa): CTR bom + 0 compras + gasto suficiente
  if (ctrGood && compras === 0 && spend >= min_spend) {
    return { status: 'VARIAR', reason: `CTR bom mas 0 compras com R$${spend.toFixed(2)} gasto - ajustar promessa` };
  }

  // ESCALAR: tudo bom
  if (ctrGood && compras >= 1 && (cpa === null || cpa <= cpa_target) && !freqWarn) {
    return { status: 'ESCALAR', reason: `CTR, CPA e frequencia dentro dos limites` };
  }

  // Edge cases: CTR bom + compras + freq warn range
  if (ctrGood && compras >= 1 && freqWarn && !freqHigh) {
    return { status: 'VARIAR', reason: `Frequencia em alerta (${frequency.toFixed(1)}) - considerar variacao` };
  }

  // Default: not enough data to decide
  if (spend < min_spend) {
    return { status: 'VARIAR', reason: `Gasto insuficiente (R$${spend.toFixed(2)}) para decisao` };
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
 * Generate diagnostic text for Dash 2
 */
export function generateDiagnosticText(
  creative: CreativeMetrics,
  settings: DecisionSettings,
  accountCtr: number
): string {
  const parts: string[] = [];

  if (creative.ctr < accountCtr) {
    parts.push(`CTR (${creative.ctr.toFixed(2)}%) abaixo da media da conta (${accountCtr.toFixed(2)}%)`);
  } else {
    parts.push(`CTR (${creative.ctr.toFixed(2)}%) acima da media da conta (${accountCtr.toFixed(2)}%)`);
  }

  if (creative.cpc !== null) {
    const avgCpc = settings.cpa_target / 10; // rough estimate
    if (creative.cpc > avgCpc * 1.5) {
      parts.push(`CPC alto (R$${creative.cpc.toFixed(2)})`);
    }
  }

  if (creative.cpm !== null && creative.cpm > 50) {
    parts.push(`CPM elevado (R$${creative.cpm.toFixed(2)})`);
  }

  if (creative.frequency >= settings.frequency_warn) {
    parts.push(`frequencia alta (${creative.frequency.toFixed(1)})`);
  }

  if (creative.compras === 0 && creative.spend > settings.min_spend) {
    parts.push(`gastou R$${creative.spend.toFixed(2)} sem conversoes`);
  }

  if (parts.length === 0) {
    return 'Este criativo esta dentro dos parametros esperados.';
  }

  const isGood = creative.ctr >= accountCtr && creative.compras > 0;
  const prefix = isGood
    ? 'Este criativo performou bem'
    : 'Este criativo performou mal';

  return `${prefix} por: ${parts.join(', ')}.`;
}
