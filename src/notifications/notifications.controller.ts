import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { TenantsService } from '../tenants/tenants.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly tenantsService: TenantsService,
    private readonly telegramService: TelegramService,
    private readonly configService: ConfigService,
  ) {}

  /** Trigger absence check: send Telegram alerts to gym owners (3/7/14 day absent members). */
  @Post('run-absence')
  async runAbsence() {
    return this.notificationsService.runAbsenceCheck();
  }

  /** List who tried to chat with the bot (Telegram opt-in attempts) for this tenant. */
  @Get('telegram-attempts')
  async listTelegramAttempts(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.listTelegramAttempts(tenantId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Get Telegram config for QR (group invite link) and whether bot is set. */
  @Get('telegram-config')
  async getTelegramConfig(@TenantId() tenantId: string) {
    return this.notificationsService.getTelegramConfig(tenantId);
  }

  /**
   * Re-register Telegram webhook for this gym's bot. Call this if messages to the bot don't appear under "attempts".
   * Requires PUBLIC_API_URL to be set on the server (e.g. https://your-api.onrender.com).
   */
  @Post('register-webhook')
  async registerWebhook(@TenantId() tenantId: string) {
    const tenant = await this.tenantsService.findById(tenantId) as Record<string, unknown> | null;
    const botToken = tenant?.telegramBotToken as string | undefined;
    if (!botToken || !String(botToken).trim()) {
      return { ok: false, error: 'No Telegram bot token set for this gym. Add it in Platform Admin → your gym → Telegram → Save.', webhookUrl: null, tenantId: null };
    }
    const base = (this.configService.get<string>('PUBLIC_API_URL') || this.configService.get<string>('FRONTEND_URL') || '').replace(/\/$/, '');
    if (!base || !base.startsWith('https://')) {
      return {
        ok: false,
        error: 'PUBLIC_API_URL is not set or not HTTPS. Set it on your host (e.g. Render: https://your-api.onrender.com) and try again. When testing from localhost, use the deployed app or set PUBLIC_API_URL in .env to your Render URL.',
        webhookUrl: null,
        tenantId,
      };
    }
    const webhookUrl = `${base}/api/notifications/telegram-webhook/${tenantId}`;
    const result = await this.telegramService.setWebhook(botToken, webhookUrl);
    return { ok: result.ok, error: result.error ?? undefined, webhookUrl: result.ok ? webhookUrl : undefined, tenantId };
  }

  /** Get the webhook URL and tenant ID for this gym (for manual setWebhook). No auth side effects. */
  @Get('webhook-info')
  async webhookInfo(@TenantId() tenantId: string) {
    const base = (this.configService.get<string>('PUBLIC_API_URL') || this.configService.get<string>('FRONTEND_URL') || '').replace(/\/$/, '');
    const webhookPath = `/api/notifications/telegram-webhook/${tenantId}`;
    const webhookUrl = base && base.startsWith('https://') ? `${base}${webhookPath}` : null;
    return { tenantId, webhookPath, webhookUrl };
  }
}
