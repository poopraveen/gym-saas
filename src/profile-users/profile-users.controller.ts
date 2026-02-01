import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ProfileUsersService } from './profile-users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('profile-users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class ProfileUsersController {
  constructor(private readonly profileUsersService: ProfileUsersService) {}

  @Post()
  create(
    @TenantId() tenantId: string,
    @Body() body: { newUserData?: Record<string, unknown> } | Record<string, unknown>,
  ) {
    const dto = body.newUserData || body;
    return this.profileUsersService.create(tenantId, dto as Record<string, unknown>);
  }

  @Get('list')
  list(@TenantId() tenantId: string) {
    return this.profileUsersService.list(tenantId);
  }
}
