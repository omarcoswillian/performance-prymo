'use client';

import { DEFAULT_SETTINGS } from '@/lib/decision-engine';
import { formatCurrency } from '@/lib/format';
import { Settings } from 'lucide-react';

const settingsDisplay = [
  { label: 'CPA Alvo', value: formatCurrency(DEFAULT_SETTINGS.cpa_target) },
  { label: 'CTR Benchmark Base', value: `${DEFAULT_SETTINGS.ctr_benchmark.toFixed(1)}%` },
  { label: 'Gasto Minimo para Decisao', value: formatCurrency(DEFAULT_SETTINGS.min_spend) },
  { label: 'Frequencia - Alerta', value: DEFAULT_SETTINGS.frequency_warn.toFixed(1) },
  { label: 'Frequencia - Matar', value: DEFAULT_SETTINGS.frequency_kill.toFixed(1) },
  { label: 'Multiplicador CPA (Matar)', value: `${DEFAULT_SETTINGS.cpa_kill_multiplier}x` },
];

export default function ConfiguracoesPage() {
  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      <h1 className="text-xl font-bold mb-4">Configuracoes</h1>

      <div className="rounded-lg border bg-card p-4 max-w-lg">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Regras de Decisao</span>
        </div>
        <div className="space-y-3">
          {settingsDisplay.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-mono font-medium">{s.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          O benchmark de CTR e calculado automaticamente pela media da conta a cada consulta.
          Edicao de configuracoes sera disponibilizada em breve.
        </div>
      </div>
    </div>
  );
}
