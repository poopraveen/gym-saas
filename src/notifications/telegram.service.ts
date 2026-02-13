import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TELEGRAM_API = 'https://api.telegram.org';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly configService: ConfigService) {}

  getBotToken(): string | null {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || null;
  }

  /** Send a text message to a Telegram chat. Use botToken for tenant-specific bot, or omit for env default. */
  async sendMessage(chatId: string, text: string, botToken?: string | null): Promise<boolean> {
    const token = botToken ?? this.getBotToken();
    if (!token) return false;
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const data = await res.json();
      return !!data?.ok;
    } catch {
      return false;
    }
  }

  /** Register webhook URL for a bot (per-tenant). Call when tenant saves Telegram bot token. */
  async setWebhook(botToken: string, webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      this.logger.warn('setWebhook skipped: PUBLIC_API_URL must be a full https URL (e.g. https://your-api.onrender.com)');
      return { ok: false, error: 'PUBLIC_API_URL must be set to a full https URL' };
    }
    try {
      const res = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = (await res.json()) as { ok?: boolean; description?: string };
      if (data?.ok) {
        this.logger.log(`Telegram webhook set: ${webhookUrl}`);
        return { ok: true };
      }
      this.logger.warn(`Telegram setWebhook failed: ${data?.description || res.statusText}`);
      return { ok: false, error: data?.description || 'Telegram API error' };
    } catch (e) {
      this.logger.warn('Telegram setWebhook error', e);
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  }
}
