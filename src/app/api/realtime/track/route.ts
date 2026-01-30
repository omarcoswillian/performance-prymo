import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Preflight */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * POST /api/realtime/track
 *
 * Public endpoint — no auth required.
 * Called by the embeddable tracking script (t.js) on client websites.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ad_account_id, session_id, page_path, event_type } = body;

    if (!ad_account_id || !session_id || !page_path) {
      return NextResponse.json(
        { error: 'ad_account_id, session_id, and page_path are required' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const supabase = createAdminClient();

    // Basic dedup: skip if same session+page within last 5 seconds
    const { data: recent } = await supabase
      .from('realtime_events')
      .select('id')
      .eq('ad_account_id', ad_account_id)
      .eq('session_id', session_id)
      .eq('page_path', page_path)
      .gte('created_at', new Date(Date.now() - 5000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ ok: true, dedup: true }, { headers: CORS_HEADERS });
    }

    const { error } = await supabase.from('realtime_events').insert({
      ad_account_id,
      session_id,
      page_path: page_path.substring(0, 500),
      event_type: event_type || 'page_view',
    });

    if (error) {
      console.error('[Realtime track] Insert error:', error.message);
      return NextResponse.json(
        { error: 'Failed to store event' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('[Realtime track] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
