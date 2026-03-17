'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertTriangle } from 'lucide-react';

export default function ConvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Validate token and redirect to client dashboard
    async function activate() {
      try {
        const res = await fetch(`/api/clients/token?token=${token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Convite invalido');
          return;
        }

        // Store token in localStorage for client session
        localStorage.setItem('mc_client_token', token);
        router.push('/cliente');
      } catch {
        setError('Erro de conexao');
      }
    }

    activate();
  }, [token, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <AlertTriangle className="h-10 w-10 text-red-500" />
          <h2 className="text-lg font-bold">Link Invalido</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Acessando seu painel...</p>
      </div>
    </div>
  );
}
