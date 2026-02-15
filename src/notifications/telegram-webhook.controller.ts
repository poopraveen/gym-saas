import { Controller, Post, Body, Param, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** Telegram sends updates with message, edited_message, etc. Use loose type so validation does not strip payload. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TelegramUpdate = Record<string, any>;

/**
 * Public Telegram webhook per tenant. Telegram calls this when someone messages the tenant's bot.
 * User should message the bot in private (or use /start in group) and send their registered phone to opt in.
 * Webhook URL is set when tenant saves Telegram in Platform Admin (requires PUBLIC_API_URL).
 */
@Controller('notifications')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('telegram-webhook/:tenantId')
  async telegramWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: TelegramUpdate,
  ) {
    const message = body?.message ?? body?.edited_message;
    const text = typeof message?.text === 'string' ? message.text : undefined;
    const chatId = message?.chat?.id;
    this.logger.log(`Telegram webhook tenantId=${tenantId} chatId=${chatId} text=${text ? `"${String(text).slice(0, 80)}"` : '(none)'}`);
    try {
      await this.notificationsService.handleTelegramWebhookForTenant(tenantId, { message });
    } catch (e) {
      this.logger.warn('Telegram webhook error', e);
    }
    return { ok: true };
  }
}
