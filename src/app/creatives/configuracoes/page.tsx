'use client';

import { DEFAULT_SETTINGS } from '@/lib/decision-engine';
import { formatCurrency } from '@/lib/format';
import { Settings, Globe, Check, Loader2, ChevronDown, RefreshCw, Share2, Shield, ShieldCheck, ShieldAlert, ShieldX, Key } from 'lucide-react';
import { useAccount } from '@/components/creatives/account-context';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

interface MetaAccount {
  id: string;
  ad_account_id: string;
  name: string;
  status: string;
  token_expires_at: string | null;
  credential_type?: string;
  credential_health?: string;
  credential_checked_at?: string | null;
}

interface GA4Property {
  propertyId: string;
  displayName: string;
}

const HEALTH_CONFIG: Record<string, { label: string; color: string; bg: string; Icon: typeof Shield }> = {
  healthy: { label: 'Saudavel', color: 'text-emerald-700', bg: 'bg-emerald-100', Icon: ShieldCheck },
  degraded: { label: 'Degradado', color: 'text-amber-700', bg: 'bg-amber-100', Icon: ShieldAlert },
  expired: { label: 'Expirado', color: 'text-red-700', bg: 'bg-red-100', Icon: ShieldX },
  unknown: { label: 'Desconhecido', color: 'text-gray-600', bg: 'bg-gray-100', Icon: Shield },
};

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

  // System User Token state
  const [systemToken, setSystemToken] = useState('');
  const [systemTokenSaving, setSystemTokenSaving] = useState(false);
  const [systemTokenMessage, setSystemTokenMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);

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

  const loadMetaAccounts = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    // Read OAuth redirect result from query params
    const success = searchParams.get('meta_success');
    const error = searchParams.get('meta_error');
    if (success) setMetaMessage({ type: 'success', text: success });
    else if (error) setMetaMessage({ type: 'error', text: error });

    loadMetaAccounts();
  }, [searchParams, loadMetaAccounts]);

  const handleReconnectMeta = () => {
    setMetaReconnecting(true);
    setMetaMessage(null);
    window.location.href = '/api/meta/oauth/start';
  };

  const handleSaveSystemToken = async () => {
    if (!selectedAccount || !systemToken.trim()) return;
    setSystemTokenSaving(true);
    setSystemTokenMessage(null);
    try {
      const res = await fetch('/api/meta/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_account_id: selectedAccount,
          system_user_token: systemToken.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSystemTokenMessage({ type: 'success', text: data.message });
        setSystemToken('');
        loadMetaAccounts();
      } else {
        setSystemTokenMessage({ type: 'error', text: data.error || 'Erro ao salvar token' });
      }
    } catch {
      setSystemTokenMessage({ type: 'error', text: 'Erro de conexao' });
    } finally {
      setSystemTokenSaving(false);
    }
  };

  const handleHealthCheck = async () => {
    if (!selectedAccount) return;
    setHealthChecking(true);
    try {
      const res = await fetch(`/api/meta/credentials/health?ad_account_id=${selectedAccount}`);
      if (res.ok) {
        loadMetaAccounts();
      }
    } catch {
      // ignore
    } finally {
      setHealthChecking(false);
    }
  };

  const getAccountStatus = (acc: MetaAccount) => {
    const health = acc.credential_health || 'unknown';
    const config = HEALTH_CONFIG[health] || HEALTH_CONFIG.unknown;
    const isSystemUser = acc.credential_type === 'system_user';

    if (isSystemUser) {
      return {
        ...config,
        label: health === 'healthy' ? 'System User' : config.label,
      };
    }

    // For user tokens, check expiration
    if (health === 'unknown') {
      const expired = !acc.token_expires_at || new Date(acc.token_expires_at) < new Date();
      if (expired) return HEALTH_CONFIG.expired;
      return { ...HEALTH_CONFIG.healthy, label: 'Conectado' };
    }

    return config;
  };

  const selectedPropertyName = ga4Properties.find(p => p.propertyId === ga4PropertyId.split('|')[0])?.displayName;

  // Find the currently selected account data
  const selectedAccountData = metaAccounts.find(a => a.ad_account_id === selectedAccount);

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
              const status = getAccountStatus(acc);
              const StatusIcon = status.Icon;
              return (
                <div key={acc.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{acc.name}</span>
                    {acc.credential_type === 'system_user' && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        <Key className="h-3 w-3" />
                        System User
                      </span>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                    <StatusIcon className="h-3 w-3" />
                    {status.label}
                  </span>
                </div>
              );
            })}
            {selectedAccountData?.credential_type !== 'system_user' &&
              selectedAccountData?.token_expires_at &&
              new Date(selectedAccountData.token_expires_at) > new Date() && (
              <p className="text-xs text-muted-foreground">
                Expira em {new Date(selectedAccountData.token_expires_at).toLocaleDateString('pt-BR')}
              </p>
            )}
            {selectedAccountData?.credential_type === 'system_user' && (
              <p className="text-xs text-emerald-600">
                Token permanente — nao expira
              </p>
            )}
            {selectedAccountData?.credential_checked_at && (
              <p className="text-xs text-muted-foreground">
                Verificado em {new Date(selectedAccountData.credential_checked_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        )}

        {metaMessage && (
          <p className={`mt-3 text-xs ${metaMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {metaMessage.text}
          </p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleReconnectMeta}
            disabled={metaReconnecting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {metaReconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {metaReconnecting ? 'Reconectando...' : 'Reconectar Meta'}
          </button>

          <button
            onClick={handleHealthCheck}
            disabled={healthChecking || !selectedAccount}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {healthChecking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {healthChecking ? 'Verificando...' : 'Verificar Saude'}
          </button>
        </div>
      </div>

      {/* System User Token */}
      <div className="rounded-lg border bg-card p-4 max-w-lg mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">System User Token</span>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Tokens de System User nao expiram e sao ideais para automacao.
          Gere em Business Manager &gt; Configuracoes &gt; Usuarios do sistema.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Token de Acesso do System User
            </label>
            <input
              type="password"
              value={systemToken}
              onChange={(e) => {
                setSystemToken(e.target.value);
                setSystemTokenMessage(null);
              }}
              placeholder="Cole o token aqui..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {systemTokenMessage && (
            <p className={`text-xs ${systemTokenMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {systemTokenMessage.text}
            </p>
          )}

          <button
            onClick={handleSaveSystemToken}
            disabled={systemTokenSaving || !systemToken.trim() || !selectedAccount}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {systemTokenSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {systemTokenSaving ? 'Validando e salvando...' : 'Validar e Salvar'}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
          <p>O token sera validado com a Meta API antes de ser salvo.</p>
          <p>Permissoes necessarias: <strong>ads_read</strong>, <strong>ads_management</strong>, <strong>business_management</strong>.</p>
          <p>Aplica-se a conta selecionada: <strong>{selectedAccount || 'nenhuma'}</strong></p>
        </div>
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

      {/* Decision Rules — Editable */}
      <SettingsEditor selectedAccount={selectedAccount} />
    </div>
  );
}

function SettingsEditor({ selectedAccount }: { selectedAccount: string | null }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState({
    cpa_target: DEFAULT_SETTINGS.cpa_target,
    cpl_target: DEFAULT_SETTINGS.cpl_target,
    min_spend_threshold: DEFAULT_SETTINGS.min_spend,
    frequency_warn: DEFAULT_SETTINGS.frequency_warn,
    frequency_kill: DEFAULT_SETTINGS.frequency_kill,
    cpa_kill_multiplier: DEFAULT_SETTINGS.cost_kill_multiplier,
  });

  // Load saved settings from DB
  useEffect(() => {
    if (!selectedAccount) return;
    setSaved(false);
    fetch(`/api/meta/settings?ad_account_id=${selectedAccount}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setValues(prev => ({
            ...prev,
            ...(data.cpa_target != null && { cpa_target: Number(data.cpa_target) }),
            ...(data.min_spend_threshold != null && { min_spend_threshold: Number(data.min_spend_threshold) }),
            ...(data.frequency_warn != null && { frequency_warn: Number(data.frequency_warn) }),
            ...(data.frequency_kill != null && { frequency_kill: Number(data.frequency_kill) }),
            ...(data.cpa_kill_multiplier != null && { cpa_kill_multiplier: Number(data.cpa_kill_multiplier) }),
          }));
        }
      })
      .catch(() => {});
  }, [selectedAccount]);

  const handleSave = async () => {
    if (!selectedAccount) return;
    setSaving(true);
    try {
      const res = await fetch('/api/meta/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ad_account_id: selectedAccount, ...values }),
      });
      if (res.ok) {
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: 'cpa_target' as const, label: 'CPA Alvo (Vendas)', prefix: 'R$' },
    { key: 'cpl_target' as const, label: 'CPL Alvo (Captura)', prefix: 'R$' },
    { key: 'min_spend_threshold' as const, label: 'Gasto Minimo para Decisao', prefix: 'R$' },
    { key: 'frequency_warn' as const, label: 'Frequencia - Alerta', prefix: '' },
    { key: 'frequency_kill' as const, label: 'Frequencia - Matar', prefix: '' },
    { key: 'cpa_kill_multiplier' as const, label: 'Multiplicador Custo (Matar)', prefix: '', suffix: 'x' },
  ];

  return (
    <div className="rounded-lg border bg-card p-4 max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Regras de Decisao</span>
          {saved && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Salvo
            </span>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline"
          >
            Editar
          </button>
        )}
      </div>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            {editing ? (
              <div className="flex items-center gap-1">
                {f.prefix && <span className="text-xs text-muted-foreground">{f.prefix}</span>}
                <input
                  type="number"
                  step="0.1"
                  value={values[f.key]}
                  onChange={(e) => setValues(prev => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-20 rounded border bg-background px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                {f.suffix && <span className="text-xs text-muted-foreground">{f.suffix}</span>}
              </div>
            ) : (
              <span className="font-mono font-medium">
                {f.prefix}{values[f.key]}{f.suffix || ''}
              </span>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving || !selectedAccount}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      )}
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        O benchmark de CTR e calculado automaticamente pela media da conta a cada consulta.
        {!selectedAccount && <p className="text-amber-600 mt-1">Selecione uma conta para editar as configuracoes.</p>}
      </div>
    </div>
  );
}
