import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runBackfillChunk } from '@/lib/meta/sync';

export const maxDuration = 300; // 5 minutes for full backfill runs

/**
 * POST /api/meta/backfill
 *
 * Runs multiple backfill chunks in sequence until either:
 * - The full history is backfilled, or
 * - The max_chunks limit is reached, or
 * - Time/quota is exhausted.
 *
 * Body: {
 *   ad_account_id: string,
 *   max_chunks?: number (default 5 — ~150 days per call)
 *   reset?: boolean (restart backfill from scratch)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ad_account_id, max_chunks = 5, reset = false } = body;

    if (!ad_account_id) {
      return NextResponse.json({ error: 'ad_account_id is required' }, { status: 400 });
    }

    // Verify ownership
    const { data: account, error: accountError } = await supabase
      .from('meta_accounts')
      .select('*')
      .eq('ad_account_id', ad_account_id)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.status !== 'active') {
      return NextResponse.json({ error: 'Account is not active' }, { status: 400 });
    }

    // Optionally reset backfill progress
    if (reset) {
      const adminClient = createAdminClient();
      await adminClient.from('meta_accounts').update({
        backfill_status: 'pending',
        backfill_cursor: null,
        backfill_oldest_date: null,
        backfill_completed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('ad_account_id', ad_account_id);
    }

    const chunks: Array<{
      insights: number;
      dateStart: string;
      dateEnd: string;
    }> = [];
    let backfillComplete = false;
    let totalInsights = 0;

    for (let i = 0; i < max_chunks; i++) {
      const result = await runBackfillChunk(
        ad_account_id,
        account.access_token,
        account.conversion_event,
        account.credential_type || 'user'
      );

      if (!result) {
        backfillComplete = true;
        break;
      }

      chunks.push({
        insights: result.insights,
        dateStart: result.dateStart,
        dateEnd: result.dateEnd,
      });
      totalInsights += result.insights;

      if (result.backfillComplete) {
        backfillComplete = true;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      ad_account_id,
      backfillComplete,
      chunksProcessed: chunks.length,
      totalInsights,
      chunks,
      oldestDate: chunks.length > 0 ? chunks[chunks.length - 1].dateStart : null,
    });
  } catch (error) {
    console.error('[Backfill] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
