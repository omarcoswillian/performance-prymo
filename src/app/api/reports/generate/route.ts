import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  applyDecisions,
  calculateAccountBenchmarkCTR,
  DEFAULT_SETTINGS,
  type CreativeMetrics,
} from '@/lib/decision-engine';
import { formatCurrency, formatPercent } from '@/lib/format';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Você é um analista sênior de mídia paga especializado em Meta Ads (Facebook/Instagram Ads).
Gere relatórios operacionais em PT-BR, diretos e sem enrolação.

Formato OBRIGATÓRIO do relatório (use markdown):

## 1. Resumo Executivo
(4-6 bullets curtos com os números mais importantes)

## 2. Situação Geral
(visão geral da mídia: investimento, retorno, distribuição de status dos criativos)

## 3. O que está funcionando
(top criativos com boas métricas, campanhas saudáveis)

## 4. O que precisa melhorar
(piores criativos, desperdício de verba, problemas de CTR/CPA)

## 5. Sugestões práticas
(ações objetivas e diretas: escalar X, matar Y, variar Z, otimizar página, travar tráfego)

## 6. Próximos passos
(checklist curto de 3-5 itens para ação imediata)

REGRAS ABSOLUTAS:
- Use APENAS os dados fornecidos no contexto. Não invente métricas.
- Se algum dado estiver faltando, mencione "dado indisponível".
- Não contradiga o status automático do sistema (ESCALAR/VARIAR/MATAR).
- Linguagem operacional e acionável. Sem buzzwords, sem enrolação.
- Cite nomes de criativos e campanhas específicas.
- Use **negrito** para destacar números importantes.
- Use bullets (- ) para listas.`;

interface GenerateRequest {
  ad_account_id: string;
  date_start: string;
  date_end: string;
  client_name: string;
  report_type?: 'ai' | 'weekly';
}

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY não configurada no servidor.' },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body: GenerateRequest = await request.json();
    const { ad_account_id, date_start, date_end, client_name, report_type = 'ai' } = body;

    if (!ad_account_id || !date_start || !date_end) {
      return NextResponse.json(
        { error: 'ad_account_id, date_start e date_end são obrigatórios.' },
        { status: 400 }
      );
    }

    // ── 1. Fetch creative data ──────────────────────────────────
    const { data: ads } = await supabase
      .from('meta_ads')
      .select('ad_id, name, thumbnail_url, format, campaign_id, adset_id, status')
      .eq('ad_account_id', ad_account_id)
      .eq('status', 'ACTIVE');

    if (!ads || ads.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum criativo ativo encontrado para esta conta no período.' },
        { status: 404 }
      );
    }

    const adIds = ads.map((a) => a.ad_id);
    const { data: insights } = await supabase
      .from('meta_ad_insights_daily')
      .select('ad_id, date, impressions, clicks, spend, conversions, cpm, cpc, ctr')
      .eq('ad_account_id', ad_account_id)
      .in('ad_id', adIds)
      .gte('date', date_start)
      .lte('date', date_end);

    const campaignIds = [...new Set(ads.map((a) => a.campaign_id))];
    const { data: campaigns } = await supabase
      .from('meta_campaigns')
      .select('campaign_id, name')
      .eq('ad_account_id', ad_account_id)
      .in('campaign_id', campaignIds);

    const campaignMap = new Map((campaigns || []).map((c) => [c.campaign_id, c.name]));

    // Aggregate per ad
    const insightsByAd = new Map<string, typeof insights>();
    for (const row of insights || []) {
      if (!insightsByAd.has(row.ad_id)) insightsByAd.set(row.ad_id, []);
      insightsByAd.get(row.ad_id)!.push(row);
    }

    const creatives: CreativeMetrics[] = ads
      .map((ad) => {
        const rows = insightsByAd.get(ad.ad_id) || [];
        const totalImpressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
        const totalClicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
        const totalSpend = rows.reduce((s, r) => s + Number(r.spend || 0), 0);
        const totalConversions = rows.reduce((s, r) => s + (r.conversions || 0), 0);
        const avgFrequency = rows.length > 0
          ? rows.reduce((s, r) => s + Number((r as Record<string, unknown>).frequency || 0), 0) / rows.length
          : 0;

        return {
          ad_id: ad.ad_id,
          name: ad.name,
          thumbnail_url: ad.thumbnail_url,
          format: ad.format as 'image' | 'video' | 'carousel' | 'unknown',
          campaign_id: ad.campaign_id,
          campaign_name: campaignMap.get(ad.campaign_id) || ad.campaign_id,
          ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
          compras: totalConversions,
          cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
          frequency: avgFrequency,
          spend: totalSpend,
          impressions: totalImpressions,
          clicks: totalClicks,
          cpc: totalClicks > 0 ? totalSpend / totalClicks : null,
          cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null,
        };
      })
      .filter((c) => c.impressions > 0)
      .sort((a, b) => b.spend - a.spend);

    if (creatives.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum dado de insights encontrado para o período selecionado.' },
        { status: 404 }
      );
    }

    // ── 2. Apply decisions ──────────────────────────────────────
    const ctrBenchmark = calculateAccountBenchmarkCTR(creatives);
    const withDecisions = applyDecisions(creatives, DEFAULT_SETTINGS, {});

    const escalar = withDecisions.filter((c) => c.status === 'ESCALAR');
    const variar = withDecisions.filter((c) => c.status === 'VARIAR');
    const matar = withDecisions.filter((c) => c.status === 'MATAR');

    const totalSpend = creatives.reduce((s, c) => s + c.spend, 0);
    const totalCompras = creatives.reduce((s, c) => s + c.compras, 0);
    const totalClicks = creatives.reduce((s, c) => s + c.clicks, 0);
    const totalImpressions = creatives.reduce((s, c) => s + c.impressions, 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpa = totalCompras > 0 ? totalSpend / totalCompras : null;

    // ── 3. Build context for AI ─────────────────────────────────
    const contextJson = {
      cliente: client_name || ad_account_id,
      periodo: { inicio: date_start, fim: date_end },
      resumo_conta: {
        total_criativos: creatives.length,
        investimento_total: formatCurrency(totalSpend),
        total_compras: totalCompras,
        ctr_medio: formatPercent(avgCtr),
        cpa_medio: avgCpa ? formatCurrency(avgCpa) : 'N/A',
        ctr_benchmark: formatPercent(ctrBenchmark),
        cpa_alvo: formatCurrency(DEFAULT_SETTINGS.cpa_target),
      },
      distribuicao_status: {
        escalar: escalar.length,
        variar: variar.length,
        matar: matar.length,
      },
      top_criativos: escalar
        .sort((a, b) => b.compras - a.compras)
        .slice(0, 5)
        .map((c) => ({
          nome: c.name,
          campanha: c.campaign_name,
          compras: c.compras,
          cpa: formatCurrency(c.cpa),
          ctr: formatPercent(c.ctr),
          gasto: formatCurrency(c.spend),
          status: c.status,
        })),
      piores_criativos: matar
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 5)
        .map((c) => ({
          nome: c.name,
          campanha: c.campaign_name,
          compras: c.compras,
          cpa: formatCurrency(c.cpa),
          ctr: formatPercent(c.ctr),
          gasto: formatCurrency(c.spend),
          motivo: c.status_reason,
          status: c.status,
        })),
      criativos_variar: variar.slice(0, 5).map((c) => ({
        nome: c.name,
        campanha: c.campaign_name,
        compras: c.compras,
        ctr: formatPercent(c.ctr),
        frequencia: c.frequency.toFixed(1),
        motivo: c.status_reason,
      })),
      gasto_sem_retorno: formatCurrency(
        creatives
          .filter((c) => c.compras === 0 && c.spend >= DEFAULT_SETTINGS.min_spend)
          .reduce((s, c) => s + c.spend, 0)
      ),
    };

    const userPrompt = `Gere o relatório para o cliente "${client_name || ad_account_id}" com base nos dados abaixo.

Período: ${date_start} a ${date_end}

DADOS:
${JSON.stringify(contextJson, null, 2)}`;

    // ── 4. Call Anthropic Claude API ────────────────────────────
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error('[Reports] Claude API error:', aiResponse.status, errBody);
      return NextResponse.json(
        { error: 'Erro ao gerar relatório com IA. Tente novamente.' },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const reportContent = aiData.content?.[0]?.text;

    if (!reportContent) {
      console.error('[Reports] Empty Claude response:', aiData);
      return NextResponse.json(
        { error: 'A IA retornou uma resposta vazia. Tente novamente.' },
        { status: 502 }
      );
    }

    // ── 5. Save to database ─────────────────────────────────────
    const { data: report, error: insertError } = await supabase
      .from('meta_reports')
      .insert({
        ad_account_id,
        client_name: client_name || ad_account_id,
        period_start: date_start,
        period_end: date_end,
        report_type,
        content: reportContent,
        context_json: contextJson,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Reports] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Erro ao salvar relatório no banco. Tente novamente.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error(
      '[Reports] Error:',
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: 'Erro interno ao gerar relatório.' },
      { status: 500 }
    );
  }
}
