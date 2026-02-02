'use client';

import { DEFAULT_SETTINGS } from '@/lib/decision-engine';
import { formatCurrency } from '@/lib/format';
import { Settings, Globe, Check, Loader2, ChevronDown, RefreshCw, Share2 } from 'lucide-react';
import { useAccount } from '@/components/creatives/account-context';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

interface MetaAccount {
  id: string;
  ad_account_id: string;
  name: string;
  status: string;
  token_expires_at: string | null;
}

interface GA4Property {
  propertyId: string;
  displayName: string;
}

const settingsDisplay = [
  { label: 'CPA Alvo (Vendas)', value: formatCurrency(DEFAULT_SETTINGS.cpa_target) },
  { label: 'CPL Alvo (Captura)', value: formatCurrency(DEFAULT_SETTINGS.cpl_target) },
  { label: 'CTR Benchmark Base', value: `${DEFAULT_SETTINGS.ctr_benchmark.toFixed(1)}%` },
  { label: 'Gasto Minimo para Decisao', value: formatCurrency(DEFAULT_SETTINGS.min_spend) },
  { label: 'Frequencia - Alerta', value: DEFAULT_SETTINGS.frequency_warn.toFixed(1) },
  { label: 'Frequencia - Matar', value: DEFAULT_SETTINGS.frequency_kill.toFixed(1) },
  { label: 'Multiplicador Custo (Matar)', value: `${DEFAULT_SETTINGS.cost_kill_multiplier}x` },
];

export default function ConfiguracoesPage() {
  const { selectedAccount } = useAccount();
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4Hostname, setGa4Hostname] = useState('');
  const [ga4Saved, setGa4Saved] = useState(false);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Saving, setGa4Saving] = useState(false);
  const [ga4Properties, setGa4Properties] = useState<GA4Property[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);

  // Load available GA4 properties from server (auto-detect)
  useEffect(() => {
    async function loadProperties() {
      setPropertiesLoading(true);
      try {
        const res = await fetch('/api/ga4/properties');
        if (res.ok) {
          const data = await res.json();
          setGa4Properties(data.properties || []);
        }
      } catch {
        // ignore — fallback to manual input
      } finally {
        setPropertiesLoading(false);
      }
    }
    loadProperties();
  }, []);

  const loadGA4Config = useCallback(async () => {
    if (!selectedAccount) return;
    setGa4Loading(true);
    try {
      const res = await fetch(`/api/ga4/config?ad_account_id=${selectedAccount}`);
      if (res.ok) {
        const data = await res.json();
        if (data.ga4_property_id) {
          const raw = data.ga4_property_id as string;
          const pipeIdx = raw.indexOf('|');
          if (pipeIdx > -1) {
            setGa4PropertyId(raw.substring(0, pipeIdx));
            setGa4Hostname(raw.substring(pipeIdx + 1));
          } else {
            setGa4PropertyId(raw);
            setGa4Hostname('');
          }
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
    setGa4Hostname('');
    setGa4Saved(false);
    loadGA4Config();
  }, [loadGA4Config]);

  const handleSaveGA4 = async () => {
    if (!selectedAccount || !ga4PropertyId.trim()) return;
    setGa4Saving(true);
    try {
      // Compose value: "propertyId" or "propertyId|hostname1,hostname2"
      let value = ga4PropertyId.trim();
      if (ga4Hostname.trim()) {
        value += '|' + ga4Hostname.trim();
      }
      const res = await fetch('/api/ga4/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_account_id: selectedAccount,
          ga4_property_id: value,
        }),
      });
      if (res.ok) {
        setGa4Saved(true);
      }
    } finally {
      setGa4Saving(false);
    }
  };

  // Meta accounts state
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaReconnecting, setMetaReconnecting] = useState(false);
  const [metaMessage, setMetaMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    // Read OAuth redirect result from query params
    const success = searchParams.get('meta_success');
    const error = searchParams.get('meta_error');
    if (success) setMetaMessage({ type: 'success', text: success });
    else if (error) setMetaMessage({ type: 'error', text: error });

    async function loadMetaAccounts() {
      setMetaLoading(true);
      try {
        const res = await fetch('/api/meta/accounts');
        if (res.ok) {
          const data = await res.json();
          setMetaAccounts(data.accounts || []);
        }
      } catch {
        // ignore
      } finally {
        setMetaLoading(false);
      }
    }
    loadMetaAccounts();
  }, [searchParams]);

  const handleReconnectMeta = () => {
    // Use server-side OAuth redirect flow instead of FB.login SDK.
    // FB.login requires HTTPS on the calling page — redirect flow works everywhere.
    setMetaReconnecting(true);
    setMetaMessage(null);
    window.location.href = '/api/meta/oauth/start';
  };

  const isTokenExpired = (expiresAt: string | null) => {
    if (!expiresAt) return true;
    return new Date(expiresAt) < new Date();
  };

  const selectedPropertyName = ga4Properties.find(p => p.propertyId === ga4PropertyId.split('|')[0])?.displayName;

  return (
    <div className="flex flex-1 flex-col px-6 py-4">
      <h1 className="text-xl font-bold mb-4">Configuracoes</h1>

      {/* Meta Ads */}
      <div className="rounded-lg border bg-card p-4 max-w-lg mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Share2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Meta Ads</span>
        </div>

        {metaLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : metaAccounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta Meta conectada.</p>
        ) : (
          <div className="space-y-2">
            {metaAccounts.map((acc) => {
              const expired = isTokenExpired(acc.token_expires_at);
              return (
                <div key={acc.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{acc.name}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${expired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {expired ? 'Token Expirado' : 'Conectado'}
                  </span>
                </div>
              );
            })}
            {metaAccounts[0]?.token_expires_at && !isTokenExpired(metaAccounts[0].token_expires_at) && (
              <p className="text-xs text-muted-foreground">
                Expira em {new Date(metaAccounts[0].token_expires_at).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
        )}

        {metaMessage && (
          <p className={`mt-3 text-xs ${metaMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {metaMessage.text}
          </p>
        )}

        <button
          onClick={handleReconnectMeta}
          disabled={metaReconnecting}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {metaReconnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {metaReconnecting ? 'Reconectando...' : 'Reconectar Meta'}
        </button>
      </div>

      {/* GA4 Config */}
      <div className="rounded-lg border bg-card p-4 max-w-lg mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Google Analytics 4</span>
          {ga4Saved && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3 w-3" /> Configurado
              {selectedPropertyName && (
                <span className="text-muted-foreground ml-1">({selectedPropertyName})</span>
              )}
            </span>
          )}
        </div>

        {ga4Loading || propertiesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Propriedade GA4
                </label>

                {ga4Properties.length > 0 ? (
                  /* Dropdown — auto-detected properties */
                  <div className="relative">
                    <select
                      value={ga4PropertyId}
                      onChange={(e) => {
                        setGa4PropertyId(e.target.value);
                        setGa4Saved(false);
                      }}
                      className="w-full appearance-none rounded-md border bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Selecione uma propriedade...</option>
                      {ga4Properties.map((p) => (
                        <option key={p.propertyId} value={p.propertyId}>
                          {p.displayName} ({p.propertyId})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                ) : (
                  /* Fallback — manual input if no properties detected */
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
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {ga4Properties.length > 0
                    ? 'Propriedades detectadas automaticamente pela Service Account.'
                    : 'Nenhuma propriedade detectada. Digite o Property ID manualmente.'}
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Hostname do site (para isolamento de dados)
                </label>
                <input
                  type="text"
                  value={ga4Hostname}
                  onChange={(e) => {
                    setGa4Hostname(e.target.value);
                    setGa4Saved(false);
                  }}
                  placeholder="Ex: meusite.com.br"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Obrigatorio se a propriedade GA4 rastreia mais de um site. Separe multiplos com virgula.
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
