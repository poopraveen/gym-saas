import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { MembersService } from './members.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('members')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /** Legacy-compatible: POST body { newUserData, deleteFlag } */
  @Post()
  upsert(
    @TenantId() tenantId: string,
    @Body() body: { newUserData: Record<string, unknown>; deleteFlag?: boolean },
  ) {
    return this.membersService.upsert(
      tenantId,
      body.newUserData || body,
      !!body.deleteFlag,
    );
  }

  @Get('list')
  list(@TenantId() tenantId: string) {
    return this.membersService.list(tenantId);
  }
}
