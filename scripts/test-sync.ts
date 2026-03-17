import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { runIncrementalSync, runBackfillChunk } from '../src/lib/meta/sync';
import type { CredentialType } from '../src/lib/meta/credentials';

const ACCT = process.argv[2] || 'act_275913160849418'; // default: Luana Carolina

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

async function main() {
  const { data } = await supabase
    .from('meta_accounts')
    .select('access_token, conversion_event, credential_type')
    .eq('ad_account_id', ACCT)
    .single();

  if (!data) { console.log('Account not found'); return; }

  const credType = (data.credential_type || 'user') as CredentialType;

  // Phase 1: Incremental
  console.log('\n=== PHASE 1: INCREMENTAL (last 3 days) ===');
  try {
    const inc = await runIncrementalSync(ACCT, data.access_token, data.conversion_event, credType);
    console.log('Result:', JSON.stringify(inc, null, 2));
  } catch (e: unknown) {
    console.error('Incremental failed:', e instanceof Error ? e.message : e);
  }

  // Phase 2: Backfill (1 chunk)
  console.log('\n=== PHASE 2: BACKFILL (1 chunk ~30 days) ===');
  try {
    const bf = await runBackfillChunk(ACCT, data.access_token, data.conversion_event, credType);
    if (bf) {
      console.log('Result:', JSON.stringify(bf, null, 2));
    } else {
      console.log('Backfill already complete');
    }
  } catch (e: unknown) {
    console.error('Backfill failed:', e instanceof Error ? e.message : e);
  }

  // Check coverage
  console.log('\n=== DATA COVERAGE ===');
  const { data: earliest } = await supabase
    .from('meta_ad_insights_daily')
    .select('date')
    .eq('ad_account_id', ACCT)
    .order('date', { ascending: true })
    .limit(1)
    .single();

  const { data: latest } = await supabase
    .from('meta_ad_insights_daily')
    .select('date')
    .eq('ad_account_id', ACCT)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  const { count } = await supabase
    .from('meta_ad_insights_daily')
    .select('*', { count: 'exact', head: true })
    .eq('ad_account_id', ACCT);

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Check today/yesterday specifically
  const { count: todayCount } = await supabase
    .from('meta_ad_insights_daily')
    .select('*', { count: 'exact', head: true })
    .eq('ad_account_id', ACCT)
    .eq('date', today);

  const { count: yesterdayCount } = await supabase
    .from('meta_ad_insights_daily')
    .select('*', { count: 'exact', head: true })
    .eq('ad_account_id', ACCT)
    .eq('date', yesterday);

  console.log(`  Earliest date: ${earliest?.date || 'N/A'}`);
  console.log(`  Latest date:   ${latest?.date || 'N/A'}`);
  console.log(`  Total rows:    ${count || 0}`);
  console.log(`  Today (${today}): ${todayCount || 0} rows`);
  console.log(`  Yesterday (${yesterday}): ${yesterdayCount || 0} rows`);

  console.log('\nDone.');
}

main();
