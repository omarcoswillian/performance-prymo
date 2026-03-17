import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTelegramMessage } from '@/lib/notifications/telegram';

/**
 * GET /api/notifications/telegram
 * Get notification preferences for current user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data } = await admin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel', 'telegram')
      .maybeSingle();

    return NextResponse.json({ preferences: data });
  } catch (error) {
    console.error('[Telegram GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/notifications/telegram
 * Save telegram preferences and optionally send test message.
 * Body: { chat_id, notify_critical?, notify_warnings?, daily_summary?, test?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { chat_id, notify_critical, notify_warnings, daily_summary, test } = body;

    if (!chat_id) {
      return NextResponse.json({ error: 'chat_id required' }, { status: 400 });
    }

    // Test message
    if (test) {
      const success = await sendTelegramMessage(
        chat_id,
        '✅ <b>Monitor Criativo</b>\n\nConexão com Telegram configurada com sucesso! Você receberá alertas neste chat.'
      );

      if (!success) {
        return NextResponse.json({
          error: 'Falha ao enviar mensagem. Verifique o Chat ID e se o bot foi iniciado.',
        }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Mensagem teste enviada!' });
    }

    // Save preferences
    const admin = createAdminClient();

    const { error } = await admin
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        channel: 'telegram',
        config: { chat_id },
        enabled: true,
        notify_critical: notify_critical ?? true,
        notify_warnings: notify_warnings ?? false,
        daily_summary: daily_summary ?? true,
      }, {
        onConflict: 'user_id,channel',
      });

    if (error) {
      console.error('[Telegram POST] Upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Preferencias salvas!' });
  } catch (error) {
    console.error('[Telegram POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
