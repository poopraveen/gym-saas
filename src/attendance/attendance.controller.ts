import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { TenantsService } from '../tenants/tenants.service';
import { NotificationsService } from '../notifications/notifications.service';
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
    private readonly tenantsService: TenantsService,
    private readonly notificationsService: NotificationsService,
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
  async checkIn(
    @TenantId() tenantId: string,
    @Body() body: { newUserData?: { 'Reg No:': number }; regNo?: number; checkedInBy?: string },
  ) {
    const regNo =
      body.newUserData?.['Reg No:'] ??
      body.regNo;
    if (regNo == null) throw new BadRequestException('regNo required');
    try {
      return await this.attendanceService.checkIn(tenantId, Number(regNo), body.checkedInBy);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Membership expired')) {
        await this.notificationsService.notifyGymOwner(tenantId, {
          pushTitle: 'Expired membership check-in attempt',
          pushBody: `Someone tried to check in with Reg. No. ${regNo} but membership is expired.`,
          pushUrl: '/',
          telegramText: `⚠️ <b>Expired membership check-in</b>\nReg. No. <b>${regNo}</b> tried to check in but membership is expired.`,
        });
      }
      throw err;
    }
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

  /** Get QR check-in URL and token for this tenant (trainer/dashboard). Token valid 24h. */
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

  /** Admin: enroll face for a member (128-d descriptor from face-api.js). */
  @Post('face-enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async faceEnroll(
    @TenantId() tenantId: string,
    @Body() body: { regNo: number; descriptor: number[] },
  ) {
    if (body.regNo == null || !Array.isArray(body.descriptor) || body.descriptor.length !== 128) {
      throw new BadRequestException('regNo and descriptor (128 numbers) required');
    }
    const ok = await this.attendanceService.faceEnroll(tenantId, Number(body.regNo), body.descriptor);
    if (!ok) throw new BadRequestException('Member not found');
    return { ok: true };
  }

  /** Admin: remove face enrollment for a member (opt out of face registration). */
  @Delete('face-enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
  async removeFaceEnroll(
    @TenantId() tenantId: string,
    @Body() body: { regNo: number },
  ) {
    if (body.regNo == null) throw new BadRequestException('regNo required');
    const ok = await this.attendanceService.removeFaceEnrollment(tenantId, Number(body.regNo));
    if (!ok) throw new BadRequestException('Member not found');
    return { ok: true };
  }

  /** Public: check-in by face (QR token + 128-d descriptor). */
  @Post('checkin-face')
  async checkInByFace(@Body() body: { token: string; descriptor: number[] }) {
    const { token, descriptor } = body || {};
    if (!token || !Array.isArray(descriptor) || descriptor.length !== 128) {
      throw new BadRequestException('token and descriptor (128 numbers) required');
    }
    const result = await this.attendanceService.checkInByFace(token, descriptor);
    if (!result) {
      const tenantId = this.attendanceService.verifyQRToken(token);
      if (tenantId) {
        await this.notificationsService.notifyGymOwner(tenantId, {
          pushTitle: 'Face recognition failed',
          pushBody: 'Someone tried to check in by face but was not recognized. They can use name/Reg. No. instead.',
          pushUrl: '/',
          telegramText: '⚠️ <b>Face recognition failed</b>\nSomeone tried to check in by face but was not recognized. They can use name/Reg. No. instead.',
        });
      }
      throw new BadRequestException('Face not recognized. Enroll your face at the gym or check in with name/Reg. No.');
    }
    return result;
  }

  /** Public: check-in by QR token (member scans QR, selects by name or enters Reg No). No auth. */
  @Post('checkin-qr')
  async checkInByQR(@Body() body: { token: string; regNo: number }) {
    const { token, regNo } = body || {};
    if (!token || regNo == null) throw new BadRequestException('token and regNo required');
    const tenantId = this.attendanceService.verifyQRToken(token);
    if (!tenantId) throw new BadRequestException('Invalid or expired QR code. Please scan the latest QR at the gym.');
    try {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Membership expired')) {
        await this.notificationsService.notifyGymOwner(tenantId, {
          pushTitle: 'Expired membership check-in attempt',
          pushBody: `Someone tried to check in with Reg. No. ${regNo} but membership is expired.`,
          pushUrl: '/',
          telegramText: `⚠️ <b>Expired membership check-in</b>\nReg. No. <b>${regNo}</b> tried to check in but membership is expired.`,
        });
      } else if (msg.includes('enrolled for face check-in')) {
        await this.notificationsService.notifyGymOwner(tenantId, {
          pushTitle: 'Face check-in required',
          pushBody: `Someone tried to check in by name/Reg. No. for a member who must use face check-in (Reg. No. ${regNo}).`,
          pushUrl: '/',
          telegramText: `⚠️ <b>Face check-in required</b>\nSomeone tried to check in by name/Reg. No. for a member who must use face check-in (Reg. No. <b>${regNo}</b>).`,
        });
      }
      throw err;
    }
  }
}
