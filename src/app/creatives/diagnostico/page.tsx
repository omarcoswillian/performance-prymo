'use client';

import { NavTabs } from '@/components/creatives/nav-tabs';

export default function DiagnosticoIndexPage() {
  return (
    <>
      <NavTabs />
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>Selecione um criativo no Painel de Comando para ver o diagnostico.</p>
      </div>
    </>
  );
}
