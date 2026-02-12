import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TELEGRAM_API = 'https://api.telegram.org';

@Injectable()
export class TelegramService {
  constructor(private readonly configService: ConfigService) {}

  getBotToken(): string | null {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') || process.env.TELEGRAM_BOT_TOKEN || null;
  }

  /** Send a text message to a Telegram chat. Returns true if sent. */
  async sendMessage(chatId: string, text: string): Promise<boolean> {
    const token = this.getBotToken();
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
}
