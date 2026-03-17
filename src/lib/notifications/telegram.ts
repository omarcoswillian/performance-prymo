/**
 * Telegram Bot API integration for sending alert notifications.
 * Requires TELEGRAM_BOT_TOKEN env var.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Escape special characters for Telegram MarkdownV2 format.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Send a message via Telegram Bot API.
 */
export async function sendTelegramMessage(
  chatId: string,
  message: string,
  parseMode: 'MarkdownV2' | 'HTML' = 'HTML'
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not configured');
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('[Telegram] Send failed:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Telegram] Send error:', error);
    return false;
  }
}

/**
 * Format an alert as an HTML message for Telegram.
 */
export function formatAlertMessage(alert: {
  type: string;
  message: string;
  severity: string;
  ad_id: string;
  ad_account_id: string;
}): string {
  const emoji = alert.severity === 'critical' ? '🔴' : '⚠️';
  const typeLabels: Record<string, string> = {
    no_conversions: 'Sem Conversões',
    ctr_fatigue: 'Fadiga de CTR',
    high_cpa: 'CPA Alto',
    frequency_fatigue: 'Frequência Alta',
  };

  return [
    `${emoji} <b>Alerta: ${typeLabels[alert.type] || alert.type}</b>`,
    '',
    alert.message,
    '',
    `<i>Ad: ${alert.ad_id}</i>`,
    `<i>Conta: ${alert.ad_account_id}</i>`,
  ].join('\n');
}

/**
 * Format a daily summary message.
 */
export function formatDailySummary(summaries: {
  name: string;
  spend: number;
  conversions: number;
  cpa: number | null;
  alerts: number;
}[]): string {
  const lines = [
    '📊 <b>Resumo Diário — Monitor Criativo</b>',
    '',
  ];

  for (const s of summaries) {
    const cpaStr = s.cpa != null ? `R$${s.cpa.toFixed(2)}` : '-';
    lines.push(`<b>${s.name}</b>`);
    lines.push(`  💰 Gasto: R$${s.spend.toFixed(2)} | 🛒 Conv: ${s.conversions} | 📉 CPA: ${cpaStr}`);
    if (s.alerts > 0) {
      lines.push(`  🔔 ${s.alerts} alerta${s.alerts > 1 ? 's' : ''} ativo${s.alerts > 1 ? 's' : ''}`);
    }
    lines.push('');
  }

  const totalSpend = summaries.reduce((s, a) => s + a.spend, 0);
  const totalConv = summaries.reduce((s, a) => s + a.conversions, 0);

  lines.push(`<b>Total:</b> R$${totalSpend.toFixed(2)} gasto | ${totalConv} conversões`);

  return lines.join('\n');
}

export { escapeMarkdownV2 };
