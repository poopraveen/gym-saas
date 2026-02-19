import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MembersService } from '../members/members.service';
import { TenantsService } from '../tenants/tenants.service';
import { Member } from '../members/schemas/member.schema';

const QR_TOKEN_EXPIRY_HOURS = 24;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly membersService: MembersService,
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
  ) {}

  /** Check-in updates member and returns check-in list. checkedInBy = trainer name or "QR" for self check-in. Rejects expired membership. */
  async checkIn(tenantId: string, regNo: number, checkedInBy?: string): Promise<Member | null> {
    const list = await this.membersService.list(tenantId);
    const member = list.find((m) => Number(m['Reg No:']) === regNo) as unknown as Member;
    if (!member) return null;

    const m = member as unknown as Record<string, unknown>;
    const dueRaw = m['DUE DATE'] ?? m.dueDate;
    if (dueRaw != null) {
      const due = new Date(dueRaw as number | string);
      if (!isNaN(due.getTime()) && due < new Date()) {
        throw new BadRequestException('Membership expired. Please contact gym admin to renew.');
      }
    }

    if (checkedInBy === 'QR') {
      const hasFace = await this.membersService.hasFaceDescriptor(tenantId, regNo);
      if (hasFace) {
        throw new BadRequestException('This member is enrolled for face check-in. Please use the face scan option to check in.');
      }
    }

    const now = new Date();
    const monthKey = String(now.getMonth());
    const monthlyAttendance = (member.monthlyAttendance || {}) as Record<string, number>;
    monthlyAttendance[monthKey] = (monthlyAttendance[monthKey] || 0) + 1;

    await this.membersService.upsert(tenantId, {
      ...member,
      lastCheckInTime: now.toISOString(),
      lastCheckInBy: checkedInBy ?? '',
      monthlyAttendance,
      lastUpdateDateTime: String(now.getTime()),
    } as Record<string, unknown>, false);

    return member;
  }

  /** List of members eligible for check-in (due date >= today only). Used for attendance screen and today's check-ins. */
  async checkInList(tenantId: string) {
    const list = await this.membersService.list(tenantId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return list.filter((row) => {
      const r = row as unknown as Record<string, unknown>;
      const dueRaw = r['DUE DATE'] ?? r.dueDate;
      if (dueRaw == null) return true;
      const due = new Date(dueRaw as number | string);
      if (isNaN(due.getTime())) return true;
      return due >= todayStart;
    });
  }

  /** Remove today's check-in for a member so they can check in again. Clears lastCheckInTime and decrements monthly count. */
  async removeTodayCheckIn(tenantId: string, regNo: number): Promise<Member | null> {
    const list = await this.membersService.list(tenantId);
    const member = list.find((m) => Number(m['Reg No:']) === regNo) as unknown as Member;
    if (!member) return null;

    const lastStr = (member.lastCheckInTime as string) || '';
    if (!lastStr.trim()) return member;
    const parsed = new Date(lastStr);
    const isToday =
      !isNaN(parsed.getTime()) &&
      parsed.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA');
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
    const validList = list.filter((row) => {
      const r = row as unknown as Record<string, unknown>;
      const dueRaw = r['DUE DATE'] ?? r.dueDate;
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

  /** Euclidean distance between two 128-d descriptors. */
  private static descriptorDistance(a: number[], b: number[]): number {
    if (a.length !== 128 || b.length !== 128) return Infinity;
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  /** Save face descriptor for a member (admin enrollment). Fails if member is already enrolled or face recognition is disabled for tenant. */
  async faceEnroll(tenantId: string, regNo: number, descriptor: number[]): Promise<boolean> {
    const settings = await this.tenantsService.getMySettings(tenantId);
    if (!settings.faceRecognitionEnabled) {
      throw new BadRequestException('Face recognition is disabled for this gym. Enable it in Check-in settings to enroll faces.');
    }
    const alreadyEnrolled = await this.membersService.hasFaceDescriptor(tenantId, regNo);
    if (alreadyEnrolled) {
      throw new BadRequestException('This member is already enrolled for face recognition. To re-enroll, clear the existing face first (or contact support).');
    }
    return this.membersService.updateFaceDescriptor(tenantId, regNo, descriptor);
  }

  /** Remove face enrollment for a member (opt out). They can check in by QR/name/Reg No again. */
  async removeFaceEnrollment(tenantId: string, regNo: number): Promise<boolean> {
    return this.membersService.clearFaceDescriptor(tenantId, regNo);
  }

  /** Find best-matching member by face descriptor. Uses stricter threshold and margin to avoid wrong-person match. */
  async findMemberByFace(tenantId: string, descriptor: number[]): Promise<{ regNo: number; name: string } | null> {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) return null;
    const settings = await this.tenantsService.getMySettings(tenantId);
    if (!settings.faceRecognitionEnabled) return null;
    const members = await this.membersService.getMembersWithFaceDescriptors(tenantId);
    if (members.length === 0) return null;
    const THRESHOLD = 0.5;
    const MARGIN = 0.08;
    const distances: { regNo: number; name: string; distance: number }[] = [];
    for (const m of members) {
      const dist = AttendanceService.descriptorDistance(descriptor, m.faceDescriptor);
      if (dist < THRESHOLD) distances.push({ regNo: m.regNo, name: m.name, distance: dist });
    }
    distances.sort((a, b) => a.distance - b.distance);
    const best = distances[0];
    if (!best) return null;
    const secondBest = distances[1];
    if (secondBest != null && secondBest.distance - best.distance < MARGIN) return null;
    return { regNo: best.regNo, name: best.name };
  }

  /** Public: check-in by face (token from QR + face descriptor). */
  async checkInByFace(token: string, descriptor: number[]): Promise<{ success: boolean; name?: string; memberSummary?: Record<string, unknown>; checkInTime?: string } | null> {
    const tenantId = this.verifyQRToken(token);
    if (!tenantId) return null;
    const settings = await this.tenantsService.getMySettings(tenantId);
    if (!settings.faceRecognitionEnabled) return null;
    const match = await this.findMemberByFace(tenantId, descriptor);
    if (!match) return null;
    const member = await this.checkIn(tenantId, match.regNo, 'Face');
    if (!member) return null;
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
