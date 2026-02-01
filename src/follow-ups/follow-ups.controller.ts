import { Controller, Get, Post, Body, UseGuards, Req, Param, Query } from '@nestjs/common';
import { FollowUpsService } from './follow-ups.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('follow-ups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  private tenantId(req: any): string {
    return req.headers['x-tenant-id'] || req.user?.tenantId;
  }

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      memberId: string;
      regNo: number;
      comment: string;
      nextFollowUpDate?: string;
    },
  ) {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('X-Tenant-ID required');
    const nextDate = body.nextFollowUpDate ? new Date(body.nextFollowUpDate) : undefined;
    return this.followUpsService.create(
      tenantId,
      body.memberId,
      body.regNo,
      body.comment,
      nextDate,
    );
  }

  @Get('batch')
  getBatch(@Req() req: any, @Query('ids') ids: string) {
    const memberIds = ids ? ids.split(',') : [];
    return this.followUpsService.getLatestByMembers(this.tenantId(req), memberIds);
  }

  @Post('batch')
  getBatchPost(@Req() req: any, @Body() body: { ids?: string[] }) {
    const memberIds = body?.ids ?? [];
    return this.followUpsService.getLatestByMembers(this.tenantId(req), memberIds);
  }

  @Get('member/:memberId')
  getByMember(@Req() req: any, @Param('memberId') memberId: string) {
    return this.followUpsService.getByMember(this.tenantId(req), memberId);
  }
}
