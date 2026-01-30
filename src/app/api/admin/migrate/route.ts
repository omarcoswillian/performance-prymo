import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;

/**
 * POST /api/admin/migrate
 * Runs pending SQL migrations via direct Postgres connection.
 * Protected by CRON_SECRET.
 *
 * If SUPABASE_DB_URL is not set, returns instructions for manual execution.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const migrations = [
    // Add hostname to ga4_page_daily for client data isolation
    `ALTER TABLE ga4_page_daily ADD COLUMN IF NOT EXISTS hostname TEXT DEFAULT NULL`,
    // Index for hostname-based queries
    `CREATE INDEX IF NOT EXISTS idx_ga4_page_daily_hostname ON ga4_page_daily (ad_account_id, hostname, date)`,
    // Add ga4_hostname to ga4_configs for manual hostname override
    `ALTER TABLE ga4_configs ADD COLUMN IF NOT EXISTS ga4_hostname TEXT DEFAULT NULL`,
    // Creative × Page map table
    `CREATE TABLE IF NOT EXISTS meta_creative_page_map (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ad_account_id TEXT NOT NULL,
      ad_id TEXT NOT NULL,
      page_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(ad_account_id, ad_id, page_url)
    )`,
    // RLS for creative page map
    `ALTER TABLE meta_creative_page_map ENABLE ROW LEVEL SECURITY`,
  ];

  // Return SQL for manual execution (no direct DB connection available)
  return NextResponse.json({
    message: 'Run the following SQL statements in the Supabase SQL Editor:',
    sql: migrations,
    combined: migrations.join(';\n\n') + ';',
  });
}
