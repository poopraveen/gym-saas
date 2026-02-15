import { Controller, Post, Get, Body, Param, Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** Telegram sends updates with message, edited_message, etc. Use loose type so validation does not strip payload. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TelegramUpdate = Record<string, any>;

/**
 * Public Telegram webhook per tenant. Telegram calls this when someone messages the tenant's bot.
 * No auth – Telegram servers POST here. In cloud: set PUBLIC_API_URL and click "Re-register webhook" from the app.
 */
@Controller('notifications')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET so you can open the webhook URL in a browser to verify it's reachable. Telegram only sends POST. */
  @Get('telegram-webhook/:tenantId')
  telegramWebhookGet(@Param('tenantId') tenantId: string) {
    this.logger.log(`Telegram webhook GET (health check) tenantId=${tenantId}`);
    return { ok: true, message: 'Webhook endpoint. Telegram sends POST here when someone messages the bot.' };
  }

  /** Accept any Telegram payload; do not reject extra properties (forbidNonWhitelisted would break Telegram's POST). */
  @Post('telegram-webhook/:tenantId')
  @UsePipes(new ValidationPipe({ forbidNonWhitelisted: false, whitelist: false }))
  async telegramWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: TelegramUpdate,
  ) {
    const message = body?.message ?? body?.edited_message;
    const text = typeof message?.text === 'string' ? message.text : undefined;
    const chatId = message?.chat?.id;
    this.logger.log(`Telegram webhook POST tenantId=${tenantId} chatId=${chatId} text=${text ? `"${String(text).slice(0, 80)}"` : '(none)'}`);
    try {
      const handled = await this.notificationsService.handleTelegramWebhookForTenant(tenantId, { message });
      if (!handled) {
        this.logger.warn(`Telegram webhook not handled: tenantId=${tenantId} (tenant not found or no bot token?)`);
      }
    } catch (e) {
      this.logger.warn('Telegram webhook error', e);
    }
    return { ok: true };
  }
}
