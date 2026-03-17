'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from '@/components/creatives/account-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Users,
  Send,
  Loader2,
  Copy,
  Check,
  Trash2,
  Clock,
  CheckCircle,
  Link2,
} from 'lucide-react';
import { toast } from 'sonner';

interface Invitation {
  id: string;
  email: string;
  ad_account_id: string;
  client_label: string | null;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

interface ClientAccess {
  id: string;
  client_user_id: string;
  ad_account_id: string;
  client_label: string | null;
  created_at: string;
}

export function ClientManagement() {
  const { selectedAccount, accounts } = useAccount();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activeClients, setActiveClients] = useState<ClientAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [clientLabel, setClientLabel] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const accountName = accounts.find(a => a.ad_account_id === selectedAccount)?.name || selectedAccount;

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clients');
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
        setActiveClients(data.active_clients || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleInvite = async () => {
    if (!email.trim() || !selectedAccount) return;
    setSending(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          ad_account_id: selectedAccount,
          client_label: clientLabel.trim() || accountName,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Convite criado! Copie o link e envie ao cliente.');
        setEmail('');
        setClientLabel('');
        fetchClients();
      } else {
        toast.error(data.error || 'Erro ao criar convite');
      }
    } catch {
      toast.error('Erro de conexao');
    } finally {
      setSending(false);
    }
  };

  const handleCopyLink = (token: string, id: string) => {
    const appUrl = window.location.origin;
    const url = `${appUrl}/convite/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (type: 'invitation' | 'access', id: string) => {
    try {
      const res = await fetch(`/api/clients?type=${type}&id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(type === 'invitation' ? 'Convite removido' : 'Acesso revogado');
        fetchClients();
      }
    } catch {
      toast.error('Erro ao remover');
    }
  };

  // Filter for selected account
  const accountInvitations = invitations.filter(i => i.ad_account_id === selectedAccount);
  const accountClients = activeClients.filter(c => c.ad_account_id === selectedAccount);

  return (
    <div className="rounded-lg border bg-card p-4 max-w-lg">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Portal do Cliente</span>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Convide clientes para visualizarem os dados da conta <strong>{accountName}</strong> em um painel exclusivo e simplificado.
      </p>

      {/* Invite form */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Email do cliente</label>
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="cliente@email.com"
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">
            Nome exibido para o cliente (opcional)
          </label>
          <Input
            type="text"
            value={clientLabel}
            onChange={e => setClientLabel(e.target.value)}
            placeholder={accountName}
            className="h-9 text-sm"
          />
        </div>
        <Button
          onClick={handleInvite}
          disabled={sending || !email.trim() || !selectedAccount}
          size="sm"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          {sending ? 'Enviando...' : 'Criar Convite'}
        </Button>
      </div>

      {/* Active clients */}
      {accountClients.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">Clientes ativos</div>
          <div className="space-y-1.5">
            {accountClients.map(c => (
              <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <div>
                    <div className="text-xs font-medium">{c.client_label || 'Cliente'}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Desde {new Date(c.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete('access', c.id)}
                  title="Revogar acesso"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending invitations */}
      {accountInvitations.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Convites pendentes</div>
          <div className="space-y-1.5">
            {accountInvitations.map(inv => {
              const isAccepted = !!inv.accepted_at;
              const isExpired = !isAccepted && new Date(inv.expires_at) < new Date();

              return (
                <div key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    {isAccepted ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    ) : isExpired ? (
                      <Clock className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                    )}
                    <div>
                      <div className="text-xs font-medium">{inv.email}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {isAccepted ? 'Aceito' : isExpired ? 'Expirado' : `Expira em ${new Date(inv.expires_at).toLocaleDateString('pt-BR')}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isAccepted && !isExpired && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleCopyLink(inv.token, inv.id)}
                        title="Copiar link do convite"
                      >
                        {copiedId === inv.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete('invitation', inv.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando...
        </div>
      )}

      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
        <p>O cliente recebe um link para criar conta e acessar um painel simplificado.</p>
        <p>O cliente ve apenas: metricas, status dos anuncios e grafico de conversoes.</p>
        <p>Voce pode revogar o acesso a qualquer momento.</p>
      </div>
    </div>
  );
}
