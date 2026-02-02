import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /** Public: resolve tenant by host or tenantId for branding (no auth). Use tenantId after login. */
  @Get('config')
  getConfig(@Query('host') host: string, @Query('tenantId') tenantId: string) {
    return this.tenantsService.getPublicConfig(host || undefined, tenantId || undefined);
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
}
