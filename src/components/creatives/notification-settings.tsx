'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Bell,
  Send,
  Loader2,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';

interface Preferences {
  chat_id: string;
  notify_critical: boolean;
  notify_warnings: boolean;
  daily_summary: boolean;
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Preferences>({
    chat_id: '',
    notify_critical: true,
    notify_warnings: false,
    daily_summary: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/telegram');
      if (res.ok) {
        const data = await res.json();
        if (data.preferences) {
          setPrefs({
            chat_id: data.preferences.config?.chat_id || '',
            notify_critical: data.preferences.notify_critical ?? true,
            notify_warnings: data.preferences.notify_warnings ?? false,
            daily_summary: data.preferences.daily_summary ?? true,
          });
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPrefs(); }, [loadPrefs]);

  const handleSave = async () => {
    if (!prefs.chat_id.trim()) {
      toast.error('Informe o Chat ID do Telegram');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/notifications/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: prefs.chat_id.trim(),
          notify_critical: prefs.notify_critical,
          notify_warnings: prefs.notify_warnings,
          daily_summary: prefs.daily_summary,
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success('Preferencias salvas!');
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Erro ao salvar');
      }
    } catch {
      toast.error('Erro de conexao');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!prefs.chat_id.trim()) {
      toast.error('Informe o Chat ID primeiro');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('/api/notifications/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: prefs.chat_id.trim(), test: true }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Mensagem teste enviada!');
      } else {
        toast.error(data.error || 'Falha no envio');
      }
    } catch {
      toast.error('Erro de conexao');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4 max-w-lg">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4 max-w-lg">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Notificacoes Telegram</span>
        {saved && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <Check className="h-3 w-3" /> Salvo
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Chat ID */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Chat ID do Telegram
          </label>
          <input
            type="text"
            value={prefs.chat_id}
            onChange={e => setPrefs(p => ({ ...p, chat_id: e.target.value }))}
            placeholder="Ex: 123456789"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          <ToggleRow
            label="Alertas criticos"
            description="CPA muito alto, gasto sem conversao"
            checked={prefs.notify_critical}
            onChange={v => setPrefs(p => ({ ...p, notify_critical: v }))}
          />
          <ToggleRow
            label="Alertas de aviso"
            description="Fadiga de CTR, frequencia alta"
            checked={prefs.notify_warnings}
            onChange={v => setPrefs(p => ({ ...p, notify_warnings: v }))}
          />
          <ToggleRow
            label="Resumo diario"
            description="Receba um resumo todo dia com metricas"
            checked={prefs.daily_summary}
            onChange={v => setPrefs(p => ({ ...p, daily_summary: v }))}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving || !prefs.chat_id.trim()} size="sm">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !prefs.chat_id.trim()} size="sm">
            {testing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            {testing ? 'Enviando...' : 'Enviar Teste'}
          </Button>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 pt-4 border-t space-y-2">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium mb-1">Como obter seu Chat ID:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Abra o Telegram e procure por <strong>@userinfobot</strong></li>
              <li>Envie qualquer mensagem para o bot</li>
              <li>Ele vai responder com seu Chat ID</li>
              <li>Cole o numero aqui</li>
            </ol>
          </div>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            O bot do Monitor Criativo precisa estar configurado no servidor (env: <strong>TELEGRAM_BOT_TOKEN</strong>).
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
