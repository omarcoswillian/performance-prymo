'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount } from '@/components/creatives/account-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Copy,
  Check,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  GitCompare,
  Brain,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  applyDecisions,
  calculateAccountBenchmarkCTR,
  DEFAULT_SETTINGS,
  type CreativeWithDecision,
  type CreativeMetrics,
} from '@/lib/decision-engine';
import {
  generateDailyReport,
  generateCreativeReport,
  generateAlignmentReport,
  generateFullReport,
  type DailyReportSection,
  type AlignmentReportGroup,
  type FullReportSection,
} from '@/lib/report-generator';
import Link from 'next/link';

type ReportTab = 'full' | 'daily' | 'creative' | 'alignment';

const tabs: { id: ReportTab; label: string; icon: typeof FileText }[] = [
  { id: 'full', label: 'Relatorio Completo', icon: Brain },
  { id: 'daily', label: 'Relatorio Diario', icon: FileText },
  { id: 'creative', label: 'Por Criativo', icon: TrendingUp },
  { id: 'alignment', label: 'Criativo x Campanha', icon: GitCompare },
];

export default function RelatoriosPage() {
  const { selectedAccount, dateStart, dateEnd } = useAccount();
  const [creatives, setCreatives] = useState<CreativeWithDecision[]>([]);
  const [ctrBenchmark, setCtrBenchmark] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportTab>('full');
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullReport, setFullReport] = useState<FullReportSection[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/meta/insights?ad_account_id=${selectedAccount}&date_start=${dateStart}&date_end=${dateEnd}&type=command`
      );
      if (res.ok) {
        const data = await res.json();
        const raw: CreativeMetrics[] = data.creatives || [];
        const withDecisions = applyDecisions(raw, DEFAULT_SETTINGS, {});
        setCreatives(withDecisions);
        const benchmark = calculateAccountBenchmarkCTR(raw);
        setCtrBenchmark(benchmark);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, dateStart, dateEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCopy = useCallback(() => {
    if (!reportRef.current) return;
    const text = reportRef.current.innerText;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleGenerateFullReport = useCallback(() => {
    if (creatives.length === 0) return;
    setGenerating(true);
    // Small delay to show loading state (report is computed locally)
    setTimeout(() => {
      const report = generateFullReport(creatives, ctrBenchmark);
      setFullReport(report);
      setGenerating(false);
    }, 300);
  }, [creatives, ctrBenchmark]);

  // Generate reports
  const dailySections = generateDailyReport(creatives, ctrBenchmark);
  const alignmentGroups = generateAlignmentReport(creatives);
  const selectedCreative = selectedCreativeId
    ? creatives.find((c) => c.ad_id === selectedCreativeId) || null
    : null;
  const creativeReport = selectedCreative
    ? generateCreativeReport(selectedCreative, ctrBenchmark)
    : null;

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Relatorios</h1>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={handleCopy}
          disabled={loading}
        >
          {copied ? (
            <Check className="mr-1 h-3 w-3" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          {copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-4 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div ref={reportRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : activeTab === 'full' ? (
          <FullReportView
            report={fullReport}
            generating={generating}
            onGenerate={handleGenerateFullReport}
            hasData={creatives.length > 0}
          />
        ) : activeTab === 'daily' ? (
          <DailyReport sections={dailySections} />
        ) : activeTab === 'creative' ? (
          <CreativeReportView
            creatives={creatives}
            selectedId={selectedCreativeId}
            onSelect={setSelectedCreativeId}
            report={creativeReport}
          />
        ) : (
          <AlignmentReport groups={alignmentGroups} />
        )}
      </div>
    </div>
  );
}

// ── Full Report View ─────────────────────────────────────────

function FullReportView({
  report,
  generating,
  onGenerate,
  hasData,
}: {
  report: FullReportSection[] | null;
  generating: boolean;
  onGenerate: () => void;
  hasData: boolean;
}) {
  if (!hasData) {
    return (
      <EmptyState message="Sem dados suficientes para gerar o relatorio." />
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Brain className="h-10 w-10 mb-4 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground mb-1">
          Relatorio completo com 4 secoes estruturadas
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          Resumo Geral, O que esta Bom, O que Precisa Melhorar e Sugestoes Praticas
        </p>
        <Button
          onClick={onGenerate}
          disabled={generating}
          className="h-10 px-6"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Brain className="mr-2 h-4 w-4" />
          )}
          {generating ? 'Gerando...' : 'Gerar Relatorio'}
        </Button>
      </div>
    );
  }

  const sectionStyles: Record<string, { border: string; bg: string; icon: typeof AlertTriangle | null }> = {
    'RESUMO GERAL': { border: 'border-blue-500/20', bg: 'bg-blue-500/5', icon: null },
    'O QUE ESTA BOM': { border: 'border-green-500/20', bg: 'bg-green-500/5', icon: null },
    'O QUE PRECISA MELHORAR': { border: 'border-red-500/20', bg: 'bg-red-500/5', icon: AlertTriangle },
    'SUGESTOES PRATICAS': { border: 'border-primary/20', bg: 'bg-primary/5', icon: null },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">
          Relatorio gerado com base nos dados do periodo selecionado
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Brain className="mr-1 h-3 w-3" />
          )}
          Regenerar
        </Button>
      </div>

      {report.map((section, i) => {
        const style = sectionStyles[section.title] || { border: '', bg: 'bg-card', icon: null };
        const IconComp = style.icon;
        return (
          <div
            key={i}
            className={cn(
              'rounded-lg border p-4',
              style.border,
              style.bg
            )}
          >
            <div className="flex items-center gap-2 mb-3">
              {IconComp && <IconComp className="h-3.5 w-3.5 text-red-500" />}
              <h3 className="text-sm font-bold uppercase tracking-wide">
                {section.title}
              </h3>
            </div>
            <div className="space-y-1.5">
              {section.content.map((line, j) => {
                const isIndented = line.startsWith('  -');
                return (
                  <div
                    key={j}
                    className={cn(
                      'text-sm',
                      isIndented
                        ? 'ml-4 text-muted-foreground flex items-start gap-2'
                        : 'text-foreground'
                    )}
                  >
                    {isIndented ? (
                      <>
                        <ChevronRight className="h-3 w-3 mt-1 shrink-0 text-muted-foreground/50" />
                        <span>{line.trim().replace(/^- /, '')}</span>
                      </>
                    ) : (
                      <span>{line}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Daily Report View ────────────────────────────────────────

function DailyReport({ sections }: { sections: DailyReportSection[] }) {
  if (sections.length === 0) {
    return (
      <EmptyState message="Sem dados suficientes para gerar o relatorio diario." />
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            <h3 className="text-sm font-semibold">{section.title}</h3>
          </div>
          <ul className="space-y-1.5 ml-4">
            {section.items.map((item, j) => (
              <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-1 shrink-0 text-muted-foreground/50" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Creative Report View ─────────────────────────────────────

function CreativeReportView({
  creatives,
  selectedId,
  onSelect,
  report,
}: {
  creatives: CreativeWithDecision[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  report: ReturnType<typeof generateCreativeReport> | null;
}) {
  if (creatives.length === 0) {
    return (
      <EmptyState message="Nenhum criativo encontrado no periodo." />
    );
  }

  return (
    <div className="flex gap-4">
      {/* Creative list */}
      <div className="w-64 shrink-0 space-y-1 overflow-auto max-h-[600px] pr-2">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Selecione um criativo
        </div>
        {creatives.map((c) => (
          <button
            key={c.ad_id}
            onClick={() => onSelect(c.ad_id)}
            className={cn(
              'w-full text-left rounded-md border px-3 py-2 text-xs transition-colors',
              selectedId === c.ad_id
                ? 'border-primary bg-accent'
                : 'hover:bg-muted/50'
            )}
          >
            <div className="font-medium truncate">{c.name}</div>
            <div className="text-muted-foreground truncate">{c.campaign_name}</div>
          </button>
        ))}
      </div>

      {/* Report */}
      <div className="flex-1">
        {!report ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            Selecione um criativo para ver o relatorio.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold mb-1">Resumo</div>
              <p className="text-sm text-muted-foreground">{report.summary}</p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold mb-1">Decisao</div>
              <p className="text-sm text-muted-foreground">{report.decision}</p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold mb-2">Analise</div>
              <ul className="space-y-1.5">
                {report.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <ChevronRight className="h-3 w-3 mt-1 shrink-0 text-muted-foreground/50" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="text-sm font-semibold mb-1">Acao recomendada</div>
              <p className="text-sm">{report.action}</p>
            </div>

            <div className="flex gap-2">
              <Link href={`/creatives/diagnostico/${selectedId}`}>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  Ver Diagnostico
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Alignment Report View ────────────────────────────────────

function AlignmentReport({ groups }: { groups: AlignmentReportGroup[] }) {
  if (groups.length === 0) {
    return (
      <EmptyState message="Sem dados suficientes para gerar o relatorio de alinhamento." />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, i) => {
        const isWarning =
          group.insight.includes('sem conversoes') ||
          group.insight.includes('performance ruim');
        return (
          <div
            key={i}
            className={cn(
              'rounded-lg border p-4',
              isWarning ? 'border-red-500/20 bg-red-500/5' : 'bg-card'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              {isWarning && (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              )}
              <h3 className="text-sm font-semibold">{group.campaignName}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {group.insight}
            </p>
            {group.details.length > 0 && (
              <ul className="space-y-1">
                {group.details.map((d, j) => (
                  <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                    <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/50" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <FileText className="h-8 w-8 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
