import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * POST /api/admin/migrate
 * Temporary endpoint to run SQL migration.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Execute migration statements individually via rpc
  const statements = [
    // 1) Add frequency column
    `ALTER TABLE meta_ad_insights_daily ADD COLUMN IF NOT EXISTS frequency NUMERIC(8,4)`,

    // 2) Settings table
    `CREATE TABLE IF NOT EXISTS meta_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ad_account_id TEXT NOT NULL UNIQUE,
      cpa_target NUMERIC(10,2) NOT NULL DEFAULT 50.00,
      ctr_benchmark_mode TEXT NOT NULL DEFAULT 'account_avg'
        CHECK (ctr_benchmark_mode IN ('account_avg', 'campaign_avg', 'fixed')),
      ctr_benchmark_fixed NUMERIC(8,4) DEFAULT 1.00,
      min_spend_threshold NUMERIC(10,2) NOT NULL DEFAULT 20.00,
      frequency_warn NUMERIC(4,2) NOT NULL DEFAULT 2.2,
      frequency_kill NUMERIC(4,2) NOT NULL DEFAULT 2.8,
      cpa_kill_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.3,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    // 3) Status overrides
    `CREATE TABLE IF NOT EXISTS meta_ad_status_overrides (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ad_account_id TEXT NOT NULL,
      ad_id TEXT NOT NULL,
      forced_status TEXT NOT NULL DEFAULT 'FORÇADO',
      note TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(ad_account_id, ad_id)
    )`,

    // 4) Pages table
    `CREATE TABLE IF NOT EXISTS meta_pages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ad_account_id TEXT NOT NULL,
      url TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      connect_rate NUMERIC(8,4),
      conversion_rate NUMERIC(8,4),
      load_time_ms INTEGER,
      sessions INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      status TEXT DEFAULT 'OK',
      last_updated TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(ad_account_id, url)
    )`,

    // 5) Creative × Page map
    `CREATE TABLE IF NOT EXISTS meta_creative_page_map (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ad_account_id TEXT NOT NULL,
      ad_id TEXT NOT NULL,
      page_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(ad_account_id, ad_id, page_url)
    )`,
  ];

  const results: string[] = [];

  for (const sql of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
      if (error) {
        // Try direct approach if rpc doesn't exist
        results.push(`RPC failed: ${error.message}`);
      } else {
        results.push('OK');
      }
    } catch (e) {
      results.push(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return NextResponse.json({ results });
}
