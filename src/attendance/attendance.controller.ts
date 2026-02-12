import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly configService: ConfigService,
  ) {}

  @Get('checkinlist')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  checkInList(@TenantId() tenantId: string) {
    return this.attendanceService.checkInList(tenantId);
  }

  @Post('checkin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  checkIn(
    @TenantId() tenantId: string,
    @Body() body: { newUserData?: { 'Reg No:': number }; regNo?: number },
  ) {
    const regNo =
      body.newUserData?.['Reg No:'] ??
      body.regNo;
    if (regNo == null) throw new BadRequestException('regNo required');
    return this.attendanceService.checkIn(tenantId, Number(regNo));
  }

  /** Get QR check-in URL and token for this tenant (staff dashboard). Token valid 24h. */
  @Get('qr-payload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  qrPayload(@TenantId() tenantId: string) {
    const token = this.attendanceService.createQRToken(tenantId);
    const baseUrl = this.configService.get<string>('FRONTEND_URL') || '';
    const checkInPath = '/checkin';
    const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}${checkInPath}?t=${encodeURIComponent(token)}` : `${checkInPath}?t=${encodeURIComponent(token)}`;
    return { url, token };
  }

  /** Public: check-in by QR token (member scans QR and enters Reg No). No auth. */
  @Post('checkin-qr')
  async checkInByQR(@Body() body: { token: string; regNo: number }) {
    const { token, regNo } = body || {};
    if (!token || regNo == null) throw new BadRequestException('token and regNo required');
    const tenantId = this.attendanceService.verifyQRToken(token);
    if (!tenantId) throw new BadRequestException('Invalid or expired QR code. Please scan the latest QR at the gym.');
    const member = await this.attendanceService.checkIn(tenantId, Number(regNo));
    if (!member) throw new BadRequestException('Registration number not found.');
    return { success: true, name: (member as any).name || (member as any).NAME };
  }
}
