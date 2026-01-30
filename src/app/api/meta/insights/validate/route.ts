import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyAccountOwnership } from '@/lib/verify-account';
import { resolveDateRange } from '@/lib/date-utils';

/**
 * GET /api/meta/insights/validate?ad_account_id=...
 *
 * Validates metric consistency: 30d >= 14d >= 7d for cumulative metrics.
 * Returns pass/fail with detailed breakdown.
 */
export async function GET(request: NextRequest) {
  try {
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

    const periods = [
      { label: '7d', ...resolveDateRange('7') },
      { label: '14d', ...resolveDateRange('14') },
      { label: '30d', ...resolveDateRange('30') },
    ];

    const results = await Promise.all(
      periods.map(async (p) => {
        const { data } = await supabase.rpc('get_account_metrics_summary', {
          p_ad_account_id: adAccountId,
          p_date_start: p.dateStart,
          p_date_end: p.dateEnd,
        });

        const d = data || {};
        return {
          period: p.label,
          dateStart: p.dateStart,
          dateEnd: p.dateEnd,
          conversions: Number(d.total_conversions || 0),
          spend: Number(d.total_spend || 0),
          clicks: Number(d.total_clicks || 0),
          impressions: Number(d.total_impressions || 0),
        };
      })
    );

    const [d7, d14, d30] = results;

    const checks = [
      {
        rule: '14d.conversions >= 7d.conversions',
        pass: d14.conversions >= d7.conversions,
        values: { '7d': d7.conversions, '14d': d14.conversions },
      },
      {
        rule: '30d.conversions >= 14d.conversions',
        pass: d30.conversions >= d14.conversions,
        values: { '14d': d14.conversions, '30d': d30.conversions },
      },
      {
        rule: '30d.spend >= 14d.spend',
        pass: d30.spend >= d14.spend,
        values: { '14d': d14.spend, '30d': d30.spend },
      },
      {
        rule: '30d.clicks >= 14d.clicks',
        pass: d30.clicks >= d14.clicks,
        values: { '14d': d14.clicks, '30d': d30.clicks },
      },
    ];

    const allPass = checks.every((c) => c.pass);

    return NextResponse.json({
      status: allPass ? 'PASS' : 'FAIL',
      ad_account_id: adAccountId,
      periods: results,
      checks,
    });
  } catch (error) {
    console.error('[Validate] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
