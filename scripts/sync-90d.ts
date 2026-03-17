import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { runIncrementalSync, runBackfillChunk } from '../src/lib/meta/sync';
import type { CredentialType } from '../src/lib/meta/credentials';

/**
 * Full sync script: runs incremental (last 3 days) + full backfill.
 *
 * Usage:
 *   npx tsx scripts/sync-90d.ts              # incremental + backfill all history
 *   npx tsx scripts/sync-90d.ts --reset      # reset backfill cursor and start over
 */

const RESET = process.argv.includes('--reset');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  const { data: accounts } = await supabase
    .from('meta_accounts')
    .select('ad_account_id, access_token, conversion_event, name, credential_type, backfill_status')
    .eq('status', 'active');

  if (!accounts) {
    console.log('No accounts');
    return;
  }
  console.log('Found', accounts.length, 'active accounts');

  for (const acc of accounts) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Account: ${acc.ad_account_id} (${acc.name})`);
    console.log(`Backfill status: ${acc.backfill_status || 'pending'}`);
    console.log('='.repeat(60));

    const credType = (acc.credential_type || 'user') as CredentialType;

    // Reset backfill if requested
    if (RESET) {
      console.log('  Resetting backfill cursor...');
      await supabase.from('meta_accounts').update({
        backfill_status: 'pending',
        backfill_cursor: null,
        backfill_oldest_date: null,
        backfill_completed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('ad_account_id', acc.ad_account_id);
    }

    // Phase 1: Incremental sync (last 3 days)
    try {
      console.log('\n  [Phase 1] Incremental sync (last 3 days)...');
      const incResult = await runIncrementalSync(
        acc.ad_account_id,
        acc.access_token,
        acc.conversion_event,
        credType
      );
      console.log(`  ✓ Incremental: ${incResult.insights} rows (${incResult.dateStart} → ${incResult.dateEnd})`);
      console.log(`    Structure: ${incResult.structure.campaigns} campaigns, ${incResult.structure.adsets} adsets, ${incResult.structure.ads} ads`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('  ✗ Incremental failed:', msg);
    }

    // Phase 2: Full backfill (all historical data)
    console.log('\n  [Phase 2] Backfill historical data...');
    let chunkCount = 0;
    let totalInsights = 0;

    while (true) {
      try {
        const result = await runBackfillChunk(
          acc.ad_account_id,
          acc.access_token,
          acc.conversion_event,
          credType
        );

        if (!result) {
          console.log('  ✓ Backfill complete!');
          break;
        }

        chunkCount++;
        totalInsights += result.insights;
        console.log(`  Chunk ${chunkCount}: ${result.dateStart} → ${result.dateEnd} — ${result.insights} rows`);

        if (result.backfillComplete) {
          console.log('  ✓ Backfill complete! Oldest date:', result.oldestDate);
          break;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ Backfill chunk ${chunkCount + 1} failed:`, msg);
        console.log('  Will resume from cursor on next run.');
        break;
      }
    }

    console.log(`  Total backfill: ${chunkCount} chunks, ${totalInsights} rows`);
  }

  // Summary: check data coverage
  console.log(`\n${'='.repeat(60)}`);
  console.log('DATA COVERAGE SUMMARY');
  console.log('='.repeat(60));

  for (const acc of accounts) {
    const { data: earliest } = await supabase
      .from('meta_ad_insights_daily')
      .select('date')
      .eq('ad_account_id', acc.ad_account_id)
      .order('date', { ascending: true })
      .limit(1)
      .single();

    const { data: latest } = await supabase
      .from('meta_ad_insights_daily')
      .select('date')
      .eq('ad_account_id', acc.ad_account_id)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const { count } = await supabase
      .from('meta_ad_insights_daily')
      .select('*', { count: 'exact', head: true })
      .eq('ad_account_id', acc.ad_account_id);

    console.log(`\n  ${acc.ad_account_id} (${acc.name}):`);
    console.log(`    Earliest: ${earliest?.date || 'N/A'}`);
    console.log(`    Latest:   ${latest?.date || 'N/A'}`);
    console.log(`    Total rows: ${count || 0}`);
  }

  console.log('\nDone.');
}

main();
