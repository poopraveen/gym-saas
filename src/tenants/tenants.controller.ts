import { Controller, Get, Post, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Role } from '../common/constants/roles';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /** Public: resolve tenant by host or tenantId for branding (no auth). Use tenantId after login. Never throws. */
  @Get('config')
  async getConfig(@Query('host') host: string, @Query('tenantId') tenantId: string) {
    try {
      return await this.tenantsService.getPublicConfig(host || undefined, tenantId || undefined);
    } catch {
      return { name: 'Reps & Dips', theme: 'dark', allowsMedicalDocuments: false, medicalDocumentsLimit: 5 };
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  create(@Body() body: { name: string; slug?: string }) {
    return this.tenantsService.create(body.name, body.slug);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  findAll() {
    return this.tenantsService.findAll();
  }

  /** Gym admin: get my tenant settings (e.g. notify on face failure). */
  @Get('my/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  getMySettings(@TenantId() tenantId: string) {
    return this.tenantsService.getMySettings(tenantId);
  }

  /** Gym admin: update my tenant settings. */
  @Patch('my/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER)
  async updateMySettings(
    @TenantId() tenantId: string,
    @Body() body: {
      notifyOwnerOnFaceFailure?: boolean;
      faceRecognitionEnabled?: boolean;
      enrollKey?: string;
      newFaceAlertEnrollKey?: string;
    },
  ) {
    return this.tenantsService.updateMySettings(tenantId, body);
  }
}
