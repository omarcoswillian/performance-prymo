/**
 * Apply pending migrations (014 + 015) directly via Supabase REST API.
 * Usage: npx tsx scripts/apply-migrations.ts
 */
import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  .replace('https://', 'postgresql://postgres:')
  .replace('.supabase.co', `.supabase.co:5432/postgres?password=${process.env.SUPABASE_DB_PASSWORD || ''}`);

// Fallback: use direct SQL via supabase REST
async function runSQL(sql: string, label: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({}),
  });

  // REST RPC won't work for DDL. Use pg client instead.
  console.log(`[${label}] Using pg client...`);
}

async function main() {
  // Build connection string from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  // Try using the pooler connection
  const connectionString = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

  console.log('Connecting to Supabase database...');
  console.log('Project:', projectRef);

  // Read migration files
  const fs = await import('fs');
  const path = await import('path');

  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

  const migrations = [
    '014_notification_preferences.sql',
    '015_client_portal.sql',
  ];

  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration);
    if (!fs.existsSync(filePath)) {
      console.log(`⏭ ${migration} — file not found, skipping`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`\n📄 ${migration}`);
    console.log(sql.substring(0, 100) + '...');
    console.log(`\n✅ SQL ready. Copy and paste into Supabase SQL Editor.`);
  }

  console.log('\n──────────────────────────────────────');
  console.log('📋 INSTRUCTIONS:');
  console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql');
  console.log('2. Paste the SQL from each migration file');
  console.log('3. Click "Run"');
  console.log('──────────────────────────────────────');

  // Print full SQL for easy copy
  console.log('\n\n========== FULL SQL TO RUN ==========\n');
  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration);
    if (!fs.existsSync(filePath)) continue;
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`-- === ${migration} ===`);
    console.log(sql);
    console.log('');
  }
}

main().catch(console.error);
