/**
 * Report Generator — Transforms existing data into actionable text.
 *
 * Rules:
 * - Uses ONLY existing data (CTR, CPA, compras, conversions, status)
 * - Does NOT decide — explains and prioritizes
 * - Does NOT contradict the automatic status
 * - Language: objective, action-focused, no buzzwords
 */

import {
  DEFAULT_SETTINGS,
  type CreativeWithDecision,
} from '@/lib/decision-engine';
import { formatCurrency, formatPercent } from '@/lib/format';

// ── Daily Report ──────────────────────────────────────────────

export interface DailyReportSection {
  title: string;
  items: string[];
}

export function generateDailyReport(
  creatives: CreativeWithDecision[],
  ctrBenchmark: number
): DailyReportSection[] {
  const sections: DailyReportSection[] = [];

  // 1. What to scale
  const toScale = creatives
    .filter((c) => c.status === 'ESCALAR')
    .sort((a, b) => b.compras - a.compras);

  sections.push({
    title: 'Escalar hoje',
    items:
      toScale.length > 0
        ? toScale.map(
            (c) =>
              `${c.name} — ${c.compras} compras, CPA ${formatCurrency(c.cpa)}, CTR ${formatPercent(c.ctr)}`
          )
        : ['Nenhum criativo com status ESCALAR no periodo.'],
  });

  // 2. What to kill
  const toKill = creatives
    .filter((c) => c.status === 'MATAR')
    .sort((a, b) => b.spend - a.spend);

  sections.push({
    title: 'Matar hoje',
    items:
      toKill.length > 0
        ? toKill.map((c) => `${c.name} — ${c.status_reason}`)
        : ['Nenhum criativo com status MATAR no periodo.'],
  });

  // 3. Wasted spend (high spend, 0 purchases)
  const wasted = creatives
    .filter((c) => c.compras === 0 && c.spend >= DEFAULT_SETTINGS.min_spend)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  if (wasted.length > 0) {
    sections.push({
      title: 'Gasto sem retorno',
      items: wasted.map(
        (c) =>
          `${c.name} — R$${c.spend.toFixed(2)} gasto, 0 compras, CTR ${formatPercent(c.ctr)}`
      ),
    });
  }

  // 4. Opportunities (good CTR but 0 purchases — adjust promise/page)
  const opportunities = creatives
    .filter(
      (c) =>
        c.ctr >= ctrBenchmark &&
        c.compras === 0 &&
        c.spend >= DEFAULT_SETTINGS.min_spend
    )
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 5);

  if (opportunities.length > 0) {
    sections.push({
      title: 'Oportunidades detectadas',
      items: opportunities.map(
        (c) =>
          `${c.name} — CTR ${formatPercent(c.ctr)} (acima do benchmark), mas 0 compras. Investigar pagina de destino ou oferta.`
      ),
    });
  }

  // 5. High conversion rate gems
  const convGems = creatives
    .filter((c) => c.clicks >= 10 && c.compras > 0)
    .map((c) => ({ ...c, convRate: (c.compras / c.clicks) * 100 }))
    .sort((a, b) => b.convRate - a.convRate)
    .slice(0, 3);

  if (convGems.length > 0) {
    sections.push({
      title: 'Maiores taxas de conversao',
      items: convGems.map(
        (c) =>
          `${c.name} — ${c.convRate.toFixed(2)}% conversao (${c.compras} compras de ${c.clicks} cliques)`
      ),
    });
  }

  return sections;
}

// ── Per-Creative Report ──────────────────────────────────────

export interface CreativeReport {
  summary: string;
  decision: string;
  reasons: string[];
  action: string;
}

export function generateCreativeReport(
  creative: CreativeWithDecision,
  ctrBenchmark: number
): CreativeReport {
  const reasons: string[] = [];

  // Performance analysis
  if (creative.ctr >= ctrBenchmark) {
    reasons.push(
      `CTR (${formatPercent(creative.ctr)}) acima do benchmark da conta (${formatPercent(ctrBenchmark)})`
    );
  } else {
    reasons.push(
      `CTR (${formatPercent(creative.ctr)}) abaixo do benchmark da conta (${formatPercent(ctrBenchmark)})`
    );
  }

  if (creative.compras > 0 && creative.cpa !== null) {
    if (creative.cpa <= DEFAULT_SETTINGS.cpa_target) {
      reasons.push(
        `CPA (${formatCurrency(creative.cpa)}) dentro do alvo (${formatCurrency(DEFAULT_SETTINGS.cpa_target)})`
      );
    } else {
      reasons.push(
        `CPA (${formatCurrency(creative.cpa)}) acima do alvo (${formatCurrency(DEFAULT_SETTINGS.cpa_target)})`
      );
    }
  }

  if (creative.compras === 0 && creative.spend >= DEFAULT_SETTINGS.min_spend) {
    reasons.push(
      `Gastou R$${creative.spend.toFixed(2)} sem nenhuma conversao`
    );
  }

  if (creative.frequency >= DEFAULT_SETTINGS.frequency_kill) {
    reasons.push(
      `Frequencia critica (${creative.frequency.toFixed(1)}) — publico ja saturado`
    );
  } else if (creative.frequency >= DEFAULT_SETTINGS.frequency_warn) {
    reasons.push(
      `Frequencia em alerta (${creative.frequency.toFixed(1)}) — proximo da saturacao`
    );
  }

  // Summary
  const isPositive =
    creative.status === 'ESCALAR' ||
    (creative.compras > 0 && creative.ctr >= ctrBenchmark);
  const summary = isPositive
    ? `Este criativo esta performando bem com ${creative.compras} compras e CTR de ${formatPercent(creative.ctr)}.`
    : creative.compras === 0
      ? `Este criativo nao gerou compras com R$${creative.spend.toFixed(2)} investidos.`
      : `Este criativo tem metricas abaixo do esperado.`;

  // Decision explanation
  const decision = `Status automatico: ${creative.status}. Motivo: ${creative.status_reason}`;

  // Recommended action
  let action: string;
  switch (creative.status) {
    case 'ESCALAR':
      action =
        'Aumentar investimento neste criativo. Considerar duplicar em novos conjuntos de anuncios.';
      break;
    case 'MATAR':
      action = 'Pausar este criativo no Meta Ads Manager imediatamente.';
      break;
    case 'VARIAR':
      if (creative.compras === 0 && creative.ctr >= ctrBenchmark) {
        action =
          'CTR bom mas sem conversao — revisar pagina de destino ou ajustar a oferta.';
      } else if (creative.frequency >= DEFAULT_SETTINGS.frequency_warn) {
        action =
          'Criar variacao deste criativo com novo hook ou angulo para combater fadiga.';
      } else {
        action = 'Monitorar por mais tempo antes de tomar decisao definitiva.';
      }
      break;
    default:
      action = 'Verificar override manual aplicado a este criativo.';
  }

  return { summary, decision, reasons, action };
}

// ── Full Structured Report (4 sections) ──────────────────────

export interface FullReportSection {
  title: string;
  content: string[];
}

export function generateFullReport(
  creatives: CreativeWithDecision[],
  ctrBenchmark: number
): FullReportSection[] {
  const sections: FullReportSection[] = [];
  const settings = DEFAULT_SETTINGS;

  const escalar = creatives.filter((c) => c.status === 'ESCALAR');
  const matar = creatives.filter((c) => c.status === 'MATAR');
  const variar = creatives.filter((c) => c.status === 'VARIAR');
  const forcado = creatives.filter((c) => c.status === 'FORÇADO');

  const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
  const totalCompras = creatives.reduce((s, c) => s + c.compras, 0);
  const totalClicks = creatives.reduce((s, c) => s + c.clicks, 0);
  const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpa = totalCompras > 0 ? totalSpend / totalCompras : null;
  const wastedSpend = creatives
    .filter((c) => c.compras === 0 && c.spend >= settings.min_spend)
    .reduce((s, c) => s + c.spend, 0);

  // ── 1. RESUMO GERAL ──
  const resumo: string[] = [
    `${creatives.length} criativos analisados no periodo.`,
    `Investimento total: ${formatCurrency(totalSpend)}. Compras: ${totalCompras}. CTR medio: ${formatPercent(avgCtr)}.`,
    avgCpa !== null
      ? `CPA medio da conta: ${formatCurrency(avgCpa)} (alvo: ${formatCurrency(settings.cpa_target)}).`
      : `Sem compras suficientes para calcular CPA medio.`,
    `Status: ${escalar.length} ESCALAR, ${variar.length} VARIAR, ${matar.length} MATAR${forcado.length > 0 ? `, ${forcado.length} FORÇADO` : ''}.`,
  ];

  if (wastedSpend > 0) {
    resumo.push(
      `Gasto sem retorno: ${formatCurrency(wastedSpend)} em criativos com 0 compras.`
    );
  }

  sections.push({ title: 'RESUMO GERAL', content: resumo });

  // ── 2. O QUE ESTA BOM ──
  const bom: string[] = [];

  // Top performing creatives
  const topPerformers = escalar
    .sort((a, b) => b.compras - a.compras)
    .slice(0, 5);

  if (topPerformers.length > 0) {
    bom.push(
      `${topPerformers.length} criativo(s) em status ESCALAR — melhores resultados:`
    );
    for (const c of topPerformers) {
      bom.push(
        `  - ${c.name}: ${c.compras} compras, CPA ${formatCurrency(c.cpa)}, CTR ${formatPercent(c.ctr)}`
      );
    }
  }

  // High conversion rate
  const highConv = creatives
    .filter((c) => c.clicks >= 10 && c.compras > 0)
    .map((c) => ({ ...c, convRate: (c.compras / c.clicks) * 100 }))
    .sort((a, b) => b.convRate - a.convRate)
    .slice(0, 3);

  if (highConv.length > 0) {
    bom.push('Maiores taxas de conversao:');
    for (const c of highConv) {
      bom.push(
        `  - ${c.name}: ${c.convRate.toFixed(2)}% conversao (${c.compras}/${c.clicks})`
      );
    }
  }

  // Good campaigns
  const campaignMap = new Map<string, CreativeWithDecision[]>();
  for (const c of creatives) {
    const key = c.campaign_name || 'Sem campanha';
    if (!campaignMap.has(key)) campaignMap.set(key, []);
    campaignMap.get(key)!.push(c);
  }

  const healthyCampaigns = Array.from(campaignMap.entries())
    .filter(([, items]) => {
      const sc = items.filter((c) => c.status === 'ESCALAR').length;
      const kc = items.filter((c) => c.status === 'MATAR').length;
      return sc > 0 && sc > kc;
    })
    .slice(0, 3);

  if (healthyCampaigns.length > 0) {
    bom.push('Campanhas com boa performance:');
    for (const [name, items] of healthyCampaigns) {
      const compras = items.reduce((s, c) => s + c.compras, 0);
      bom.push(`  - ${name}: ${compras} compras, ${items.filter((c) => c.status === 'ESCALAR').length} criativos escalando`);
    }
  }

  if (bom.length === 0) {
    bom.push('Nenhum criativo com performance positiva destacada no periodo.');
  }

  sections.push({ title: 'O QUE ESTA BOM', content: bom });

  // ── 3. O QUE PRECISA MELHORAR ──
  const melhorar: string[] = [];

  // Creatives to kill
  if (matar.length > 0) {
    const worstBySpend = matar
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
    melhorar.push(
      `${matar.length} criativo(s) com status MATAR — piores por gasto:`
    );
    for (const c of worstBySpend) {
      melhorar.push(
        `  - ${c.name}: ${c.status_reason}. Gasto: ${formatCurrency(c.spend)}.`
      );
    }
  }

  // Low CTR
  const lowCtr = creatives
    .filter(
      (c) =>
        c.ctr < ctrBenchmark &&
        c.spend >= settings.min_spend &&
        c.impressions >= 100
    )
    .sort((a, b) => a.ctr - b.ctr)
    .slice(0, 5);

  if (lowCtr.length > 0) {
    melhorar.push(
      `Criativos com CTR abaixo do benchmark (${formatPercent(ctrBenchmark)}):`
    );
    for (const c of lowCtr) {
      melhorar.push(
        `  - ${c.name}: CTR ${formatPercent(c.ctr)}, ${c.clicks} cliques`
      );
    }
  }

  // High CTR but 0 purchases (page/offer issue)
  const hookNoPurchase = creatives
    .filter(
      (c) =>
        c.ctr >= ctrBenchmark &&
        c.compras === 0 &&
        c.spend >= settings.min_spend
    )
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  if (hookNoPurchase.length > 0) {
    melhorar.push('Criativos com bom CTR mas 0 compras (possivel problema de pagina/oferta):');
    for (const c of hookNoPurchase) {
      melhorar.push(
        `  - ${c.name}: CTR ${formatPercent(c.ctr)}, ${formatCurrency(c.spend)} gasto`
      );
    }
  }

  // High CPA
  const highCpa = creatives
    .filter(
      (c) => c.cpa !== null && c.cpa > settings.cpa_target && c.compras > 0
    )
    .sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))
    .slice(0, 5);

  if (highCpa.length > 0) {
    melhorar.push(
      `Criativos com CPA acima do alvo (${formatCurrency(settings.cpa_target)}):`
    );
    for (const c of highCpa) {
      melhorar.push(
        `  - ${c.name}: CPA ${formatCurrency(c.cpa)}, ${c.compras} compras`
      );
    }
  }

  if (melhorar.length === 0) {
    melhorar.push('Nenhum problema critico identificado no periodo.');
  }

  sections.push({ title: 'O QUE PRECISA MELHORAR', content: melhorar });

  // ── 4. SUGESTOES PRATICAS ──
  const sugestoes: string[] = [];

  // Scale recommendations
  if (escalar.length > 0) {
    sugestoes.push(
      `ESCALAR: Aumentar investimento nos ${escalar.length} criativo(s) com status ESCALAR. Priorizar os com menor CPA e maior volume de compras.`
    );
  }

  // Kill recommendations
  if (matar.length > 0) {
    sugestoes.push(
      `MATAR: Pausar ${matar.length} criativo(s) com status MATAR no Meta Ads Manager. Gasto acumulado sem retorno: ${formatCurrency(matar.reduce((s, c) => s + (c.compras === 0 ? c.spend : 0), 0))}.`
    );
  }

  // Variation recommendations
  const fatigued = variar.filter(
    (c) => c.frequency >= settings.frequency_warn
  );
  if (fatigued.length > 0) {
    sugestoes.push(
      `VARIAR (fadiga): ${fatigued.length} criativo(s) com frequencia alta. Criar variacoes com novo hook ou angulo.`
    );
  }

  // Page/offer adjustment
  if (hookNoPurchase.length > 0) {
    sugestoes.push(
      `AJUSTAR PAGINA: ${hookNoPurchase.length} criativo(s) atraem cliques mas nao convertem. Revisar pagina de destino, oferta ou alinhamento da promessa.`
    );
  }

  // General observation
  if (totalCompras === 0) {
    sugestoes.push(
      'ATENCAO: Nenhuma compra registrada no periodo. Verificar configuracao de pixel, pagina de destino e oferta.'
    );
  } else if (avgCpa !== null && avgCpa > settings.cpa_target * 1.5) {
    sugestoes.push(
      `ATENCAO: CPA medio da conta (${formatCurrency(avgCpa)}) esta 50%+ acima do alvo. Considerar revisar segmentacao e criativos em massa.`
    );
  }

  if (sugestoes.length === 0) {
    sugestoes.push(
      'Conta operando dentro dos parametros esperados. Continuar monitorando metricas diariamente.'
    );
  }

  sections.push({ title: 'SUGESTOES PRATICAS', content: sugestoes });

  return sections;
}

// ── Creative × Campaign Alignment Report ─────────────────────

export interface AlignmentReportGroup {
  campaignName: string;
  insight: string;
  details: string[];
}

export function generateAlignmentReport(
  creatives: CreativeWithDecision[]
): AlignmentReportGroup[] {
  // Group by campaign
  const groups = new Map<string, CreativeWithDecision[]>();
  for (const c of creatives) {
    const key = c.campaign_name || 'Sem campanha';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const reports: AlignmentReportGroup[] = [];

  for (const [campaignName, items] of groups) {
    const totalSpend = items.reduce((s, c) => s + c.spend, 0);
    const totalCompras = items.reduce((s, c) => s + c.compras, 0);
    const withPurchases = items.filter((c) => c.compras > 0);
    const withoutPurchases = items.filter(
      (c) => c.compras === 0 && c.spend >= DEFAULT_SETTINGS.min_spend
    );

    const details: string[] = [];

    if (withPurchases.length > 0) {
      const best = withPurchases.sort((a, b) => b.compras - a.compras)[0];
      details.push(
        `Melhor criativo: ${best.name} (${best.compras} compras, CPA ${formatCurrency(best.cpa)})`
      );
    }

    if (withoutPurchases.length > 0) {
      const worst = withoutPurchases.sort((a, b) => b.spend - a.spend)[0];
      details.push(
        `Maior gasto sem retorno: ${worst.name} (R$${worst.spend.toFixed(2)} gasto, 0 compras)`
      );
    }

    const killCount = items.filter((c) => c.status === 'MATAR').length;
    const scaleCount = items.filter((c) => c.status === 'ESCALAR').length;

    // Insight
    let insight: string;
    if (totalCompras === 0) {
      insight = `Campanha sem conversoes. R$${totalSpend.toFixed(2)} investidos em ${items.length} criativos sem resultado.`;
    } else if (killCount > scaleCount && killCount > 0) {
      insight = `Maioria dos criativos com performance ruim (${killCount} para matar vs ${scaleCount} para escalar).`;
    } else if (scaleCount > 0 && killCount === 0) {
      insight = `Campanha saudavel. ${scaleCount} criativos escalando, ${totalCompras} compras totais.`;
    } else {
      insight = `Performance mista. ${scaleCount} escalando, ${killCount} para matar. ${totalCompras} compras com R$${totalSpend.toFixed(2)} investidos.`;
    }

    if (details.length > 0 || insight) {
      reports.push({ campaignName, insight, details });
    }
  }

  return reports.sort((a, b) => {
    // Sort by campaigns with more issues first
    const aHasIssue = a.insight.includes('sem conversoes') || a.insight.includes('performance ruim');
    const bHasIssue = b.insight.includes('sem conversoes') || b.insight.includes('performance ruim');
    if (aHasIssue !== bHasIssue) return aHasIssue ? -1 : 1;
    return 0;
  });
}
