import { Controller, Get, Post, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
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

  /** Delete one Telegram opt-in attempt. */
  @Delete('telegram-attempts/:id')
  async deleteTelegramAttempt(@TenantId() tenantId: string, @Param('id') id: string) {
    const deleted = await this.notificationsService.deleteTelegramAttempt(tenantId, id);
    if (!deleted) return { ok: false, error: 'Attempt not found or already deleted' };
    return { ok: true };
  }

  /** Get Telegram config for QR (group invite link) and whether bot is set. */
  @Get('telegram-config')
  async getTelegramConfig(@TenantId() tenantId: string) {
    return this.notificationsService.getTelegramConfig(tenantId);
  }

  /**
   * Re-register Telegram webhook for this gym's bot.
   * If body.webhookUrl is provided (e.g. ngrok URL when testing from localhost), that URL is used. Otherwise PUBLIC_API_URL on the server is used.
   */
  @Post('register-webhook')
  async registerWebhook(
    @TenantId() tenantId: string,
    @Body() body?: { webhookUrl?: string },
  ) {
    const tenant = await this.tenantsService.findById(tenantId) as Record<string, unknown> | null;
    const botToken = tenant?.telegramBotToken as string | undefined;
    if (!botToken || !String(botToken).trim()) {
      return { ok: false, error: 'No Telegram bot token set for this gym. Add it in Platform Admin → your gym → Telegram → Save.', webhookUrl: null, tenantId: null };
    }
    const expectedPath = `/api/notifications/telegram-webhook/${tenantId}`;
    let webhookUrl: string;

    const passedUrl = typeof body?.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    if (passedUrl && passedUrl.startsWith('https://')) {
      const base = passedUrl.replace(/\/$/, '');
      if (passedUrl.includes('/api/notifications/telegram-webhook/')) {
        if (!passedUrl.endsWith(expectedPath)) {
          return { ok: false, error: 'The URL must end with your gym\'s webhook path: ' + expectedPath, webhookUrl: null, tenantId };
        }
        webhookUrl = passedUrl;
      } else {
        webhookUrl = `${base}${expectedPath}`;
      }
    } else {
      const base = (this.configService.get<string>('PUBLIC_API_URL') || this.configService.get<string>('FRONTEND_URL') || '').replace(/\/$/, '');
      if (!base || !base.startsWith('https://')) {
        return {
          ok: false,
          error: 'No webhook URL. Either paste your tunnel URL below (e.g. https://xxxx.ngrok-free.dev) and click "Register with this URL", or set PUBLIC_API_URL on the server (e.g. on Render).',
          webhookUrl: null,
          tenantId,
        };
      }
      webhookUrl = `${base}${expectedPath}`;
    }

    try {
      const urlHost = new URL(webhookUrl).hostname;
      const tld = urlHost.split('.').pop() ?? '';
      if (tld.length < 2 || urlHost.endsWith('.ngrok-free.d')) {
        return {
          ok: false,
          error: 'The URL looks incomplete. Ngrok URLs usually end with .ngrok-free.dev or .ngrok-free.app (not .ngrok-free.d). Copy the full URL from the ngrok terminal.',
          webhookUrl: null,
          tenantId,
        };
      }
    } catch {
      return { ok: false, error: 'Invalid webhook URL format.', webhookUrl: null, tenantId };
    }

    const result = await this.telegramService.setWebhook(botToken, webhookUrl);
    let errorMsg = result.error ?? undefined;
    if (errorMsg && (errorMsg.includes('Failed to resolve host') || errorMsg.includes('Name or service not known'))) {
      errorMsg = 'Telegram could not resolve the URL. Use the full ngrok URL from the ngrok window (e.g. https://xxxx.ngrok-free.dev or .ngrok-free.app), not .ngrok-free.d.';
    }
    return { ok: result.ok, error: errorMsg, webhookUrl: result.ok ? webhookUrl : undefined, tenantId };
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
