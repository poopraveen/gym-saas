import { Injectable } from '@nestjs/common';
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
}
