import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
  Param,
} from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { AttendanceService } from '../attendance/attendance.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { CountersService } from '../counters/counters.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles';

/**
 * Legacy API compatibility - matches old Netlify/Express routes.
 * Frontend can point to /api/legacy/* with X-Tenant-ID + Bearer token.
 */
@Controller('legacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TENANT_ADMIN, Role.MANAGER, Role.STAFF)
export class LegacyController {
  constructor(
    private readonly membersService: MembersService,
    private readonly attendanceService: AttendanceService,
    private readonly followUpsService: FollowUpsService,
    private readonly countersService: CountersService,
  ) {}

  private tenantId(req: any): string {
    return req.headers['x-tenant-id'] || req.user?.tenantId;
  }

  @Post()
  async upsertMember(@Req() req: any, @Body() body: { newUserData?: Record<string, unknown>; deleteFlag?: boolean }) {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('X-Tenant-ID required');
    return this.membersService.upsert(tenantId, body.newUserData || body, !!body.deleteFlag);
  }

  @Get('list')
  async list(@Req() req: any) {
    return this.membersService.list(this.tenantId(req));
  }

  /** Lookup a single member by gym ID (e.g. GYM-2025-00001) or Reg No. Only onboarded members. */
  @Get('lookup')
  async lookup(@Req() req: any, @Query('gymId') gymId: string, @Query('regNo') regNo: string) {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('X-Tenant-ID required');
    const query = gymId || regNo || '';
    return this.membersService.findByGymIdOrRegNo(tenantId, query);
  }

  @Get('checkinlist')
  async checkInList(@Req() req: any) {
    return this.attendanceService.checkInList(this.tenantId(req));
  }

  @Post('checkin')
  async checkIn(@Req() req: any, @Body() body: { newUserData?: { 'Reg No:': number } }) {
    const tenantId = this.tenantId(req);
    const regNo = body.newUserData?.['Reg No:'];
    if (regNo == null) throw new Error('newUserData.Reg No: required');
    return this.attendanceService.checkIn(tenantId, Number(regNo));
  }

  @Get('finance')
  async finance(@Req() req: any) {
    const tenantId = this.tenantId(req);
    const summary = await this.membersService.getFinanceSummary(tenantId);
    const monthlyGrowth = await this.membersService.getMonthlyGrowth(tenantId, 6);
    const monthlyCollections = await this.membersService.getMonthlyCollections(tenantId, 12);
    return { ...summary, monthlyGrowth, monthlyCollections };
  }

  @Post('followups')
  async createFollowUp(
    @Req() req: any,
    @Body()
    body: { memberId: string; regNo: number; comment: string; nextFollowUpDate?: string },
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

  @Get('followups-batch')
  async getFollowUpsBatch(@Req() req: any, @Query('ids') ids: string) {
    const memberIds = ids ? ids.split(',') : [];
    return this.followUpsService.getLatestByMembers(this.tenantId(req), memberIds);
  }

  @Get('followups-member/:memberId')
  async getFollowUpsByMember(@Req() req: any, @Param('memberId') memberId: string) {
    return this.followUpsService.getByMember(this.tenantId(req), memberId);
  }

  @Get('next-receipt-id')
  async getNextReceiptId(@Req() req: any) {
    const tenantId = this.tenantId(req);
    if (!tenantId) throw new Error('X-Tenant-ID required');
    const receiptId = await this.countersService.getNextReceiptId(tenantId);
    return { receiptId };
  }

  @Get('backup')
  async backup(@Req() req: any) {
    const tenantId = this.tenantId(req);
    const list = await this.membersService.list(tenantId);
    const defaultListData: Array<{ registerNo: number; phoneNo: string; message: string }> = [];
    const now = new Date();

    list.forEach((row: Record<string, unknown>) => {
      const dueDate = row['DUE DATE'] ? new Date(row['DUE DATE'] as number) : null;
      if (!dueDate) return;
      const daysDiff = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const rowColor = isNaN(daysDiff) || daysDiff < -90 ? '#f0f0b7' : daysDiff >= -90 && daysDiff <= 0 ? '#f47979' : '#2afc0094';
      if (rowColor === '#f47979') {
        const phone = `+91${row['Phone Number'] || ''}`;
        const message = `Hi ${row['NAME']} your Reps & Dips subscription package already expired since ${Math.abs(daysDiff)} days. Pay on ${dueDate.toLocaleDateString()}. Reg No: ${row['Reg No:']}`;
        defaultListData.push({
          registerNo: row['Reg No:'] as number,
          phoneNo: phone,
          message,
        });
      }
    });

    // TODO: Integrate Twilio sendSms here if configured
    return defaultListData;
  }
}
