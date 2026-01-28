'use client';

import { DEFAULT_SETTINGS } from '@/lib/decision-engine';
import { formatCurrency } from '@/lib/format';
import { Settings, Globe, Check, Loader2 } from 'lucide-react';
import { useAccount } from '@/components/creatives/account-context';
import { useState, useEffect, useCallback } from 'react';

const settingsDisplay = [
  { label: 'CPA Alvo', value: formatCurrency(DEFAULT_SETTINGS.cpa_target) },
  { label: 'CTR Benchmark Base', value: `${DEFAULT_SETTINGS.ctr_benchmark.toFixed(1)}%` },
  { label: 'Gasto Minimo para Decisao', value: formatCurrency(DEFAULT_SETTINGS.min_spend) },
  { label: 'Frequencia - Alerta', value: DEFAULT_SETTINGS.frequency_warn.toFixed(1) },
  { label: 'Frequencia - Matar', value: DEFAULT_SETTINGS.frequency_kill.toFixed(1) },
  { label: 'Multiplicador CPA (Matar)', value: `${DEFAULT_SETTINGS.cpa_kill_multiplier}x` },
];

export default function ConfiguracoesPage() {
  const { selectedAccount } = useAccount();
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4Saved, setGa4Saved] = useState(false);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Saving, setGa4Saving] = useState(false);

  const loadGA4Config = useCallback(async () => {
    if (!selectedAccount) return;
    setGa4Loading(true);
    try {
      const res = await fetch(`/api/ga4/config?ad_account_id=${selectedAccount}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ga4_property_id) {
          setGa4PropertyId(data.ga4_property_id);
          setGa4Saved(true);
        }
      }
    } catch {
      // ignore
    } finally {
      setGa4Loading(false);
    }
  }, [selectedAccount]);

  useEffect(() => {
    setGa4PropertyId('');
    setGa4Saved(false);
    loadGA4Config();
  }, [loadGA4Config]);

  const handleSaveGA4 = async () => {
    if (!selectedAccount || !ga4PropertyId.trim()) return;
    setGa4Saving(true);
    try {
      const res = await fetch('/api/ga4/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_account_id: selectedAccount,
          ga4_property_id: ga4PropertyId.trim(),
        }),
      });
      if (res.ok) {
        setGa4Saved(true);
      }
    } finally {
      setGa4Saving(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      <h1 className="text-xl font-bold mb-4">Configuracoes</h1>

      {/* GA4 Config */}
      <div className="rounded-lg border bg-card p-4 max-w-lg mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Google Analytics 4</span>
          {ga4Saved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3 w-3" /> Configurado
            </span>
          )}
        </div>

        {ga4Loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  GA4 Property ID
                </label>
                <input
                  type="text"
                  value={ga4PropertyId}
                  onChange={(e) => {
                    setGa4PropertyId(e.target.value);
                    setGa4Saved(false);
                  }}
                  placeholder="Ex: 123456789"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Encontre em: GA4 &gt; Admin &gt; Property Settings &gt; Property ID
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveGA4}
              disabled={ga4Saving || !ga4PropertyId.trim()}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {ga4Saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {ga4Saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        )}

        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
          <p>A Service Account do GA4 deve estar configurada no servidor (.env).</p>
          <p>Adicione a Service Account como <strong>Viewer</strong> no GA4 Property.</p>
        </div>
      </div>

      {/* Decision Rules */}
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
