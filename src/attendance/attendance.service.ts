import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MembersService } from '../members/members.service';
import { Member } from '../members/schemas/member.schema';

const QR_TOKEN_EXPIRY_HOURS = 24;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly membersService: MembersService,
    private readonly configService: ConfigService,
  ) {}

  /** Check-in updates member and returns check-in list. checkedInBy = staff name or "QR" for self check-in. Rejects expired membership. */
  async checkIn(tenantId: string, regNo: number, checkedInBy?: string): Promise<Member | null> {
    const list = await this.membersService.list(tenantId);
    const member = list.find((m) => Number(m['Reg No:']) === regNo) as unknown as Member;
    if (!member) return null;

    const dueRaw = member['DUE DATE'] ?? (member as any).dueDate;
    if (dueRaw != null) {
      const due = new Date(dueRaw as number | string);
      if (!isNaN(due.getTime()) && due < new Date()) {
        throw new BadRequestException('Membership expired. Please contact gym admin to renew.');
      }
    }

    const now = new Date();
    const monthKey = String(now.getMonth());
    const monthlyAttendance = (member.monthlyAttendance || {}) as Record<string, number>;
    monthlyAttendance[monthKey] = (monthlyAttendance[monthKey] || 0) + 1;

    await this.membersService.upsert(tenantId, {
      ...member,
      lastCheckInTime: now.toLocaleString(),
      lastCheckInBy: checkedInBy ?? '',
      monthlyAttendance,
      lastUpdateDateTime: String(now.getTime()),
    } as Record<string, unknown>, false);

    return member;
  }

  /** List of members with today's check-ins. */
  async checkInList(tenantId: string) {
    return this.membersService.list(tenantId);
  }

  /** Remove today's check-in for a member so they can check in again. Clears lastCheckInTime and decrements monthly count. */
  async removeTodayCheckIn(tenantId: string, regNo: number): Promise<Member | null> {
    const list = await this.membersService.list(tenantId);
    const member = list.find((m) => Number(m['Reg No:']) === regNo) as unknown as Member;
    if (!member) return null;

    const lastStr = (member.lastCheckInTime as string) || '';
    const today = new Date().toLocaleDateString();
    const isToday = lastStr.split(',')[0]?.trim() === today;
    if (!isToday) return member;

    const now = new Date();
    const monthKey = String(now.getMonth());
    const monthlyAttendance = { ...((member.monthlyAttendance || {}) as Record<string, number>) };
    const current = monthlyAttendance[monthKey] || 0;
    if (current > 0) monthlyAttendance[monthKey] = current - 1;

    await this.membersService.upsert(tenantId, {
      ...member,
      lastCheckInTime: '',
      lastCheckInBy: '',
      monthlyAttendance,
      lastUpdateDateTime: String(now.getTime()),
    } as Record<string, unknown>, false);

    return { ...member, lastCheckInTime: '', lastCheckInBy: '', monthlyAttendance } as unknown as Member;
  }

  /** Create a signed token for QR check-in (valid 24h). Token payload: tenantId + expiry. */
  createQRToken(tenantId: string): string {
    const secret = this.configService.get<string>('JWT_SECRET') || 'qr-secret';
    const exp = Date.now() + QR_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
    const payload = `${tenantId}|${exp}`;
    const sig = createHmac('sha256', secret).update(payload).digest('base64url');
    const b64 = Buffer.from(payload, 'utf8').toString('base64url');
    return `${b64}.${sig}`;
  }

  /** Verify QR token and return tenantId or null. */
  verifyQRToken(token: string): string | null {
    try {
      const secret = this.configService.get<string>('JWT_SECRET') || 'qr-secret';
      const [b64, sig] = token.split('.');
      if (!b64 || !sig) return null;
      const payload = Buffer.from(b64, 'base64url').toString('utf8');
      const expectedSig = createHmac('sha256', secret).update(payload).digest('base64url');
      if (sig !== expectedSig) return null;
      const [tenantId, expStr] = payload.split('|');
      const exp = parseInt(expStr, 10);
      if (isNaN(exp) || Date.now() > exp) return null;
      return tenantId || null;
    } catch {
      return null;
    }
  }

  /** List member names and reg numbers for QR check-in page autocomplete (token must be valid). Only members with valid membership (due date not passed). */
  async getMembersForQRCheckIn(token: string): Promise<{ regNo: number; name: string }[]> {
    const tenantId = this.verifyQRToken(token);
    if (!tenantId) return [];
    const list = await this.membersService.list(tenantId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const validList = list.filter((m) => {
      const dueRaw = m['DUE DATE'] ?? (m as any).dueDate;
      if (dueRaw == null) return true;
      const due = new Date(dueRaw as number | string);
      if (isNaN(due.getTime())) return true;
      return due >= todayStart;
    });
    return validList.map((m) => ({
      regNo: Number(m['Reg No:']) || 0,
      name: String(m.NAME ?? m.name ?? ''),
    })).filter((m) => m.regNo && m.name.trim());
  }
}
