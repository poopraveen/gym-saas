import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';
import { PlatformService } from './platform.service';
import { TenantsService, CreateTenantDto, UpdateTenantDto } from '../tenants/tenants.service';

@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlatformController {
  constructor(
    private platformService: PlatformService,
    private tenantsService: TenantsService,
  ) {}

  @Post('tenants')
  createTenant(@Body() body: CreateTenantDto) {
    return this.platformService.createTenantWithDefaults(body);
  }

  @Get('tenants')
  listTenants() {
    return this.tenantsService.findAll();
  }

  @Get('tenants/:id')
  async getTenant(@Param('id') id: string) {
    const details = await this.platformService.getTenantDetails(id);
    if (!details) throw new ForbiddenException('Tenant not found');
    return details;
  }

  @Put('tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body() body: UpdateTenantDto,
  ) {
    return this.tenantsService.updateTenant(id, body);
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
}
