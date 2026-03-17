import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/meta/overview
 * Returns aggregate metrics for ALL accounts belonging to the user.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const dateStart = params.get('date_start');
    const dateEnd = params.get('date_end');

    if (!dateStart || !dateEnd) {
      return NextResponse.json({ error: 'date_start and date_end required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get all accounts for this user
    const { data: accounts } = await admin
      .from('meta_accounts')
      .select('ad_account_id, name, credential_health, credential_type, token_expires_at')
      .eq('user_id', user.id);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // Fetch aggregate metrics for each account in parallel
    const accountSummaries = await Promise.all(
      accounts.map(async (account) => {
        const { ad_account_id, name, credential_health, credential_type, token_expires_at } = account;

        // Get aggregate insights
        const { data: insights } = await admin
          .from('meta_ad_insights_daily')
          .select('impressions, clicks, spend, conversions, conversion_value')
          .eq('ad_account_id', ad_account_id)
          .gte('date', dateStart)
          .lte('date', dateEnd);

        const totals = (insights || []).reduce(
          (acc, row) => ({
            impressions: acc.impressions + Number(row.impressions || 0),
            clicks: acc.clicks + Number(row.clicks || 0),
            spend: acc.spend + Number(row.spend || 0),
            conversions: acc.conversions + Number(row.conversions || 0),
            conversion_value: acc.conversion_value + Number(row.conversion_value || 0),
          }),
          { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversion_value: 0 }
        );

        // Get active ads count
        const { count: activeAds } = await admin
          .from('meta_ads')
          .select('ad_id', { count: 'exact', head: true })
          .eq('ad_account_id', ad_account_id)
          .eq('status', 'ACTIVE');

        // Get last sync
        const { data: lastSync } = await admin
          .from('meta_sync_log')
          .select('synced_at, status')
          .eq('ad_account_id', ad_account_id)
          .order('synced_at', { ascending: false })
          .limit(1);

        // Get active alert count
        const { count: alertCount } = await admin
          .from('meta_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('ad_account_id', ad_account_id)
          .is('resolved_at', null);

        const cpa = totals.conversions > 0 ? totals.spend / totals.conversions : null;
        const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
        const roas = totals.spend > 0 && totals.conversion_value > 0
          ? totals.conversion_value / totals.spend : null;

        // Determine health
        let health: 'healthy' | 'degraded' | 'expired' | 'unknown' = 'unknown';
        if (credential_health) {
          health = credential_health as typeof health;
        } else if (credential_type === 'system_user') {
          health = 'healthy';
        } else if (token_expires_at) {
          health = new Date(token_expires_at) < new Date() ? 'expired' : 'healthy';
        }

        return {
          ad_account_id,
          name,
          health,
          credential_type,
          ...totals,
          cpa,
          ctr,
          roas,
          active_ads: activeAds || 0,
          active_alerts: alertCount || 0,
          last_sync: lastSync?.[0]?.synced_at || null,
          last_sync_status: lastSync?.[0]?.status || null,
        };
      })
    );

    // Calculate totals
    const totalSpend = accountSummaries.reduce((s, a) => s + a.spend, 0);
    const totalConversions = accountSummaries.reduce((s, a) => s + a.conversions, 0);
    const totalConvValue = accountSummaries.reduce((s, a) => s + a.conversion_value, 0);
    const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
    const avgRoas = totalSpend > 0 && totalConvValue > 0 ? totalConvValue / totalSpend : null;

    return NextResponse.json({
      accounts: accountSummaries,
      totals: {
        spend: totalSpend,
        conversions: totalConversions,
        conversion_value: totalConvValue,
        cpa: avgCpa,
        roas: avgRoas,
        account_count: accountSummaries.length,
      },
    });
  } catch (error) {
    console.error('[Overview]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
