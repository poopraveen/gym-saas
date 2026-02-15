import {
  Controller,
  Get,
  Post,
  Body,
  Query,
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
    @Body() body: { newUserData?: { 'Reg No:': number }; regNo?: number; checkedInBy?: string },
  ) {
    const regNo =
      body.newUserData?.['Reg No:'] ??
      body.regNo;
    if (regNo == null) throw new BadRequestException('regNo required');
    return this.attendanceService.checkIn(tenantId, Number(regNo), body.checkedInBy);
  }

  /** Remove today's check-in for a member so they can re-enter. */
  @Post('remove-today')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  removeTodayCheckIn(
    @TenantId() tenantId: string,
    @Body() body: { regNo: number },
  ) {
    if (body.regNo == null) throw new BadRequestException('regNo required');
    return this.attendanceService.removeTodayCheckIn(tenantId, Number(body.regNo));
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

  /** Public: list members (name + regNo) for QR check-in page autocomplete. Token required. */
  @Get('checkin-qr-members')
  async getCheckInQRMembers(@Query('t') token: string) {
    if (!token) return { members: [] };
    const members = await this.attendanceService.getMembersForQRCheckIn(token);
    return { members };
  }

  /** Public: check-in by QR token (member scans QR, selects by name or enters Reg No). No auth. */
  @Post('checkin-qr')
  async checkInByQR(@Body() body: { token: string; regNo: number }) {
    const { token, regNo } = body || {};
    if (!token || regNo == null) throw new BadRequestException('token and regNo required');
    const tenantId = this.attendanceService.verifyQRToken(token);
    if (!tenantId) throw new BadRequestException('Invalid or expired QR code. Please scan the latest QR at the gym.');
    const member = await this.attendanceService.checkIn(tenantId, Number(regNo), 'QR');
    if (!member) throw new BadRequestException('Registration number not found.');
    const m = member as unknown as Record<string, unknown>;
    const name = (m.name ?? m.NAME) as string;
    const dueRaw = m['DUE DATE'] ?? m.dueDate;
    const dueDate =
      dueRaw != null && !isNaN(new Date(dueRaw as string | number).getTime())
        ? new Date(dueRaw as string | number).toISOString()
        : undefined;
    const checkInTime = new Date().toISOString();
    const memberSummary = {
      name,
      dueDate,
      phoneNumber: (m['Phone Number'] ?? m.phoneNumber) as string | undefined,
      typeofPack: (m['Typeof pack'] ?? m.typeofPack) as string | undefined,
    };
    return { success: true, name, memberSummary, checkInTime };
  }
}
