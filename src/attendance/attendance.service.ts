import { Injectable } from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { Member } from '../members/schemas/member.schema';

@Injectable()
export class AttendanceService {
  constructor(private readonly membersService: MembersService) {}

  /** Check-in updates member and returns check-in list. */
  async checkIn(tenantId: string, regNo: number): Promise<Member | null> {
    const list = await this.membersService.list(tenantId);
    const member = list.find((m) => Number(m['Reg No:']) === regNo) as unknown as Member;
    if (!member) return null;

    const now = new Date();
    const monthKey = String(now.getMonth());
    const monthlyAttendance = (member.monthlyAttendance || {}) as Record<string, number>;
    monthlyAttendance[monthKey] = (monthlyAttendance[monthKey] || 0) + 1;

    await this.membersService.upsert(tenantId, {
      ...member,
      lastCheckInTime: now.toLocaleString(),
      monthlyAttendance,
      lastUpdateDateTime: String(now.getTime()),
    } as Record<string, unknown>, false);

    return member;
  }

  /** List of members with today's check-ins. */
  async checkInList(tenantId: string) {
    return this.membersService.list(tenantId);
  }
}
