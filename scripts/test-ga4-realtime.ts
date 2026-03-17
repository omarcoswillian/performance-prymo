/**
 * Quick test: call GA4 Realtime API directly to see if it works.
 * Run: npx tsx scripts/test-ga4-realtime.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { BetaAnalyticsDataClient } from '@google-analytics/data';

async function main() {
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  let privateKey: string | undefined;
  if (process.env.GA4_PRIVATE_KEY_BASE64) {
    privateKey = Buffer.from(process.env.GA4_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
  } else {
    privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');
  }

  console.log('Client email:', clientEmail);
  console.log('Private key present:', !!privateKey);
  console.log('Private key starts with:', privateKey?.substring(0, 30));

  if (!clientEmail || !privateKey) {
    console.error('Missing GA4 credentials');
    process.exit(1);
  }

  const client = new BetaAnalyticsDataClient({
    credentials: { client_email: clientEmail, private_key: privateKey },
  });

  // First, get the property ID from Supabase
  // For now, let's try to list what we can access
  console.log('\n--- Testing GA4 Realtime API ---');

  // We need the property ID. Let's read it from the DB or hardcode for testing.
  // Try to get it from the ga4_configs table
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: configs, error: configError } = await supabase
    .from('ga4_configs')
    .select('ad_account_id, ga4_property_id')
    .limit(5);

  if (configError) {
    console.error('Error fetching GA4 configs:', configError.message);
    process.exit(1);
  }

  console.log('GA4 configs found:', configs?.length);
  if (!configs || configs.length === 0) {
    console.error('No GA4 configs found');
    process.exit(1);
  }

  for (const cfg of configs) {
    const raw = cfg.ga4_property_id;
    const propertyId = raw.includes('|') ? raw.split('|')[0] : raw;
    console.log(`\nAccount: ${cfg.ad_account_id}`);
    console.log(`Property ID: ${propertyId}`);

    try {
      const [response] = await client.runRealtimeReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'unifiedScreenName' }],
        metrics: [{ name: 'activeUsers' }],
      });

      let totalUsers = 0;
      const pages: { path: string; users: number }[] = [];
      for (const row of response.rows || []) {
        const path = row.dimensionValues?.[0]?.value || '';
        const users = parseInt(row.metricValues?.[0]?.value || '0', 10);
        totalUsers += users;
        pages.push({ path, users });
      }

      console.log(`✅ Active users: ${totalUsers}`);
      console.log(`✅ Active pages: ${pages.length}`);
      if (pages.length > 0) {
        console.log('Top pages:', pages.sort((a, b) => b.users - a.users).slice(0, 5));
      }
    } catch (err) {
      console.error('❌ GA4 Realtime API error:', err instanceof Error ? err.message : err);
    }
  }
}

main().catch(console.error);
