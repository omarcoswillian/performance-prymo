import { config } from 'dotenv';
config({ path: '.env.local' });
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const clientEmail = process.env.GA4_CLIENT_EMAIL || '';
let privateKey: string | undefined;
if (process.env.GA4_PRIVATE_KEY_BASE64) {
  privateKey = Buffer.from(process.env.GA4_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
} else {
  privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

const client = new BetaAnalyticsDataClient({
  credentials: { client_email: clientEmail, private_key: privateKey },
});

async function test(propertyId: string, dimName: string | null) {
  try {
    const req: Record<string, unknown> = {
      property: `properties/${propertyId}`,
      metrics: [{ name: 'activeUsers' }],
    };
    if (dimName) {
      req.dimensions = [{ name: dimName }];
    }
    const [response] = await client.runRealtimeReport(req);
    let total = 0;
    for (const row of response.rows || []) {
      const val = dimName
        ? row.metricValues?.[0]?.value
        : row.metricValues?.[0]?.value;
      total += parseInt(val || '0', 10);
    }
    const pages = (response.rows || []).map(r => ({
      dim: r.dimensionValues?.[0]?.value,
      users: r.metricValues?.[0]?.value,
    }));
    console.log(`✅ dim=${dimName || 'NONE'} prop=${propertyId}: ${total} users, ${response.rows?.length || 0} rows`);
    if (pages.length > 0) {
      console.log('   Top:', pages.slice(0, 3));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ dim=${dimName || 'NONE'} prop=${propertyId}: ${msg.substring(0, 100)}`);
  }
}

async function main() {
  const props = ['358716960', '518571133'];
  const dims = ['unifiedPagePathScreen', 'unifiedScreenName', 'pagePath', 'pageTitle', null];

  for (const p of props) {
    for (const d of dims) {
      await test(p, d);
    }
    console.log('---');
  }
}

main().catch(console.error);
