import { Controller, Post, Body, Param, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Public Telegram webhook per tenant. Telegram calls this when someone messages the tenant's bot.
 * Set webhook per tenant: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<API_BASE>/api/notifications/telegram-webhook/<tenantId>
 */
@Controller('notifications')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('telegram-webhook/:tenantId')
  async telegramWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: { update_id?: number; message?: { chat?: { id: number }; text?: string } },
  ) {
    const text = body?.message?.text;
    const chatId = body?.message?.chat?.id;
    this.logger.log(`Telegram webhook received tenantId=${tenantId} chatId=${chatId} text=${text ? `"${String(text).slice(0, 50)}"` : '(none)'}`);
    try {
      await this.notificationsService.handleTelegramWebhookForTenant(tenantId, body);
    } catch (e) {
      this.logger.warn('Telegram webhook error', e);
    }
    return { ok: true };
  }
}
