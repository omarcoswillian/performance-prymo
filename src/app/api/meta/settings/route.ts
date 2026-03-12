import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';

/**
 * GET /api/meta/settings?ad_account_id=...
 * Returns the decision settings for an ad account.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adAccountId = request.nextUrl.searchParams.get('ad_account_id');
  if (!adAccountId) {
    return NextResponse.json({ error: 'ad_account_id required' }, { status: 400 });
  }

  const ownership = await verifyAccountOwnership(supabase, user.id, adAccountId);
  if (!ownership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data } = await supabase
    .from('meta_settings')
    .select('*')
    .eq('ad_account_id', adAccountId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json(null);
  }

  return NextResponse.json(data);
}

/**
 * POST /api/meta/settings
 * Creates or updates decision settings for an ad account.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { ad_account_id, cpa_target, cpl_target, min_spend_threshold, frequency_warn, frequency_kill, cpa_kill_multiplier } = body;

  if (!ad_account_id) {
    return NextResponse.json({ error: 'ad_account_id required' }, { status: 400 });
  }

  const ownership = await verifyAccountOwnership(supabase, user.id, ad_account_id);
  if (!ownership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const row: Record<string, unknown> = {
    ad_account_id,
    updated_at: new Date().toISOString(),
  };

  if (cpa_target != null) row.cpa_target = Number(cpa_target);
  if (min_spend_threshold != null) row.min_spend_threshold = Number(min_spend_threshold);
  if (frequency_warn != null) row.frequency_warn = Number(frequency_warn);
  if (frequency_kill != null) row.frequency_kill = Number(frequency_kill);
  if (cpa_kill_multiplier != null) row.cpa_kill_multiplier = Number(cpa_kill_multiplier);

  const { error } = await supabase
    .from('meta_settings')
    .upsert(row, { onConflict: 'ad_account_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
