import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listGA4Properties } from '@/lib/ga4';

/**
 * GET /api/ga4/properties
 * Lists all GA4 properties accessible by the service account.
 * Used for the configuration dropdown (no manual ID entry).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
    }

    const properties = await listGA4Properties();
    return NextResponse.json({ properties });
  } catch (error) {
    console.error('[GA4 Properties]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: 'Erro ao listar propriedades GA4. Verifique as credenciais do servidor.' },
      { status: 500 }
    );
  }
}
