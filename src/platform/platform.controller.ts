import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  StreamableFile,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';
import { PlatformService } from './platform.service';
import { TenantsService, CreateTenantDto, UpdateTenantDto } from '../tenants/tenants.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlatformController {
  private readonly logger = new Logger(PlatformController.name);

  constructor(
    private platformService: PlatformService,
    private tenantsService: TenantsService,
    private notificationsService: NotificationsService,
  ) {}

  @Post('tenants')
  createTenant(@Body() body: CreateTenantDto) {
    return this.platformService.createTenantWithDefaults(body);
  }

  @Get('tenants')
  async listTenants() {
    try {
      return await this.tenantsService.findAll();
    } catch (err) {
      this.logger.error('listTenants failed', err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to load tenants. Check server logs and MongoDB connection.',
      );
    }
  }

  @Get('tenants/:id')
  async getTenant(@Param('id') id: string) {
    try {
      const details = await this.platformService.getTenantDetails(id);
      if (!details) throw new ForbiddenException('Tenant not found');
      const d = details as Record<string, unknown>;
      if (d._id != null) d._id = String(d._id);
      if (d.createdAt instanceof Date) d.createdAt = (d.createdAt as Date).toISOString();
      if (d.updatedAt instanceof Date) d.updatedAt = (d.updatedAt as Date).toISOString();
      return d;
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error('getTenant failed', err instanceof Error ? err.stack : err);
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Failed to load tenant details.',
      );
    }
  }

  /** Preview Telegram config for a tenant (same as gym admin GET /notifications/telegram-config). */
  @Get('tenants/:id/telegram-config')
  async getTenantTelegramConfig(@Param('id') id: string) {
    return this.notificationsService.getTelegramConfig(id);
  }

  @Put('tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
  ) {
    return this.platformService.updateTenant(id, body);
  }

  @Post('tenants/:id/reset-admin')
  async resetTenantAdmin(
    @Param('id') tenantId: string,
    @Body() body: { email: string; newPassword: string },
  ) {
    const ok = await this.platformService.resetTenantAdmin(
      tenantId,
      body.email,
      body.newPassword,
    );
    if (!ok) throw new ForbiddenException('User not found');
    return { success: true };
  }

  @Post('tenants/:tenantId/trainers')
  async createTrainer(
    @Param('tenantId') tenantId: string,
    @Body() body: { email: string; password: string; name?: string },
  ) {
    if (!body.email?.trim() || !body.password || body.password.length < 6) {
      throw new BadRequestException('email and password (min 6 characters) required');
    }
    return this.platformService.createTrainer(
      tenantId,
      body.email.trim(),
      body.password,
      body.name?.trim(),
    );
  }

  /** GET /platform/tenants/:id/pitch-pdf — generate application pitch PDF for this tenant (SUPER_ADMIN only). */
  @Get('tenants/:id/pitch-pdf')
  async getTenantPitchPdf(@Param('id') id: string) {
    const { buffer, fileName } = await this.platformService.getTenantPitchPdf(id);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${fileName}"`,
    });
  }
}
