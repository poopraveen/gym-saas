import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('checkinlist')
  checkInList(@TenantId() tenantId: string) {
    return this.attendanceService.checkInList(tenantId);
  }

  @Post('checkin')
  checkIn(
    @TenantId() tenantId: string,
    @Body() body: { newUserData?: { 'Reg No:': number }; regNo?: number },
  ) {
    const regNo =
      body.newUserData?.['Reg No:'] ??
      body.regNo;
    if (regNo == null) throw new Error('regNo required');
    return this.attendanceService.checkIn(tenantId, Number(regNo));
  }
}
