'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from '@/components/creatives/account-context';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  Copy,
  Check,
  Brain,
  Loader2,
  Trash2,
  Download,
  Calendar,
  Clock,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ──────────────────────────────────────────────────────

type ReportTab = 'ai' | 'weekly';

interface Report {
  id: string;
  ad_account_id: string;
  client_name: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  report_type: 'ai' | 'weekly';
  content: string;
}

// ── Helpers ────────────────────────────────────────────────────

function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatTimestampBR(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Page ───────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const { selectedAccount, accounts, dateStart, dateEnd } = useAccount();
  const [activeTab, setActiveTab] = useState<ReportTab>('ai');
  const [reports, setReports] = useState<Report[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const clientName =
    accounts.find((a) => a.ad_account_id === selectedAccount)?.name ||
    selectedAccount;

  // ── Fetch reports ────────────────────────────────────────────

  const fetchReports = useCallback(async () => {
    if (!selectedAccount) return;
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/reports?ad_account_id=${selectedAccount}`
      );
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    setReports([]);
    setSelectedReport(null);
    fetchReports();
  }, [fetchReports]);

  // ── Generate ─────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!selectedAccount || !dateStart || !dateEnd) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_account_id: selectedAccount,
          date_start: dateStart,
          date_end: dateEnd,
          client_name: clientName,
          report_type: activeTab,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Erro ao gerar relatório.');
        return;
      }

      const data = await res.json();
      setReports((prev) => [data.report, ...prev]);
      setSelectedReport(data.report);
      toast.success('Relatório gerado com sucesso!');
    } catch {
      toast.error('Erro de conexão ao gerar relatório.');
    } finally {
      setGenerating(false);
    }
  }, [selectedAccount, dateStart, dateEnd, clientName, activeTab]);

  // ── Delete ───────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (reportId: string) => {
      setDeletingId(reportId);
      try {
        const res = await fetch(`/api/reports?id=${reportId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setReports((prev) => prev.filter((r) => r.id !== reportId));
          if (selectedReport?.id === reportId) setSelectedReport(null);
          toast.success('Relatório excluído.');
        } else {
          toast.error('Erro ao excluir relatório.');
        }
      } catch {
        toast.error('Erro de conexão.');
      } finally {
        setDeletingId(null);
      }
    },
    [selectedReport]
  );

  // ── Copy ─────────────────────────────────────────────────────

  const handleCopy = useCallback(() => {
    if (!selectedReport) return;
    navigator.clipboard.writeText(selectedReport.content).then(() => {
      setCopied(true);
      toast.success('Relatório copiado!');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedReport]);

  // ── Download ─────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!selectedReport) return;
    const safeName = selectedReport.client_name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const filename = `relatorio_${safeName}_${selectedReport.period_start}_${selectedReport.period_end}.md`;
    const header = `# Relatório ${selectedReport.report_type === 'weekly' ? 'Semanal' : 'com IA'} - Cliente: ${selectedReport.client_name}\n\nPeríodo: ${formatDateBR(selectedReport.period_start)} a ${formatDateBR(selectedReport.period_end)}\nGerado em: ${formatTimestampBR(selectedReport.generated_at)}\n\n---\n\n`;
    const blob = new Blob([header + selectedReport.content], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Download iniciado!');
  }, [selectedReport]);

  // ── Filter by tab ────────────────────────────────────────────

  const filteredReports = reports.filter((r) => r.report_type === activeTab);

  const tabs: { id: ReportTab; label: string }[] = [
    { id: 'ai', label: 'Relatórios com IA' },
    { id: 'weekly', label: 'Relatórios Semanais' },
  ];

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Relatórios</h1>
        <Button
          onClick={handleGenerate}
          disabled={generating || !selectedAccount}
          className="h-9 px-5"
        >
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Brain className="mr-2 h-4 w-4" />
          )}
          {generating ? 'Gerando...' : 'Gerar com IA'}
        </Button>
      </div>

      {/* Period info */}
      {dateStart && dateEnd && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            Período: {formatDateBR(dateStart)} a {formatDateBR(dateEnd)}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>Cliente: {clientName}</span>
        </div>
      )}

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
            {tab.id === 'ai' ? (
              <Brain className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report list */}
      <div className="flex-1 overflow-auto">
        {loadingList ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-lg border p-4"
              >
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <EmptyState activeTab={activeTab} />
        ) : (
          <div className="space-y-2">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className="flex items-center gap-4 rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer group"
                onClick={() => setSelectedReport(report)}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                  {report.report_type === 'ai' ? (
                    <Brain className="h-5 w-5" />
                  ) : (
                    <FileText className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {report.client_name}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDateBR(report.period_start)} a{' '}
                      {formatDateBR(report.period_end)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestampBR(report.generated_at)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(report.id);
                  }}
                  disabled={deletingId === report.id}
                >
                  {deletingId === report.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Report Modal ──────────────────────────────────────── */}
      <Dialog
        open={!!selectedReport}
        onOpenChange={(open) => !open && setSelectedReport(null)}
      >
        <DialogContent
          className="sm:max-w-3xl max-h-[85vh] flex flex-col"
          showCloseButton={false}
        >
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg">
                Relatório{' '}
                {selectedReport?.report_type === 'weekly'
                  ? 'Semanal'
                  : 'com IA'}{' '}
                — {selectedReport?.client_name}
              </DialogTitle>
            </div>
            {selectedReport && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateBR(selectedReport.period_start)} a{' '}
                  {formatDateBR(selectedReport.period_end)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Gerado em {formatTimestampBR(selectedReport.generated_at)}
                </span>
              </div>
            )}
          </DialogHeader>

          {/* Content */}
          <div className="flex-1 overflow-auto pr-2 -mr-2">
            <MarkdownRenderer content={selectedReport?.content || ''} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t mt-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Baixar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setSelectedReport(null)}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Markdown Renderer ──────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## Heading 2
    if (line.startsWith('## ')) {
      elements.push(
        <h2
          key={i}
          className="text-base font-bold mt-5 mb-2 text-foreground border-b pb-1"
        >
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    // ### Heading 3
    if (line.startsWith('### ')) {
      elements.push(
        <h3
          key={i}
          className="text-sm font-semibold mt-4 mb-1.5 text-foreground"
        >
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }

    // # Heading 1
    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={i}
          className="text-lg font-bold mt-4 mb-2 text-foreground"
        >
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // Bullet list
    if (line.trimStart().startsWith('- ')) {
      const indent = line.length - line.trimStart().length;
      elements.push(
        <div
          key={i}
          className="flex items-start gap-2 text-sm text-muted-foreground my-0.5"
          style={{ paddingLeft: `${Math.max(0, indent / 2) * 12}px` }}
        >
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
          <span className="leading-relaxed">
            {renderInline(line.trimStart().slice(2))}
          </span>
        </div>
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line.trimStart())) {
      const match = line.trimStart().match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div
            key={i}
            className="flex items-start gap-2 text-sm text-muted-foreground my-0.5"
          >
            <span className="text-xs font-semibold text-muted-foreground/60 mt-0.5 min-w-[16px]">
              {match[1]}.
            </span>
            <span className="leading-relaxed">{renderInline(match[2])}</span>
          </div>
        );
        continue;
      }
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={i} className="my-3 border-border" />);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-sm text-foreground my-1 leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-foreground">
        {match[1]}
      </strong>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 0 ? text : <>{parts}</>;
}

// ── Empty State ────────────────────────────────────────────────

function EmptyState({ activeTab }: { activeTab: ReportTab }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Brain className="h-10 w-10 mb-4 opacity-20" />
      <p className="text-sm font-medium mb-1">Nenhum relatório gerado</p>
      <p className="text-xs">
        {activeTab === 'ai'
          ? 'Clique em "Gerar com IA" para criar um relatório inteligente.'
          : 'Clique em "Gerar com IA" para criar um relatório semanal.'}
      </p>
    </div>
  );
}
