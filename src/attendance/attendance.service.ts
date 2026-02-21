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

  /** Whether Python face service fallback is configured. When true, client should send image for match/enroll. */
  getFaceConfig(): { useImageForMatch: boolean } {
    const url = this.configService.get<string>('FACE_SERVICE_URL');
    return { useImageForMatch: !!url?.trim() };
  }

  private getFaceServiceUrl(): string | null {
    const url = this.configService.get<string>('FACE_SERVICE_URL');
    return url?.trim() || null;
  }

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
        const name = String(m.NAME ?? m.name ?? '—');
        const phone = (m['Phone Number'] ?? m.phoneNumber) as string | undefined;
        throw new BadRequestException({
          message: 'Membership expired. Please contact gym admin to renew.',
          member: { name, regNo, phone, dueDate: dueRaw },
        });
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

  /** All gym members for attendance view (no due-date filter). */
  async getAllMembersForAttendance(tenantId: string) {
    return this.membersService.list(tenantId);
  }

  /** Members whose due date has passed (membership expired). */
  async getExpiredMembers(tenantId: string): Promise<Member[]> {
    const list = await this.membersService.list(tenantId);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return list.filter((row) => {
      const r = row as unknown as Record<string, unknown>;
      const dueRaw = r['DUE DATE'] ?? r.dueDate;
      if (dueRaw == null) return false;
      const due = new Date(dueRaw as number | string);
      if (isNaN(due.getTime())) return false;
      return due < todayStart;
    }) as unknown as Member[];
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

  /** Reject enrollment only when very confident same person (stricter than check-in to avoid false positives). */
  private static readonly ENROLL_DUPLICATE_THRESHOLD = 0.28;

  /** Skip corrupt/invalid stored descriptors that can cause false "already registered" matches. */
  private static isDescriptorValid(descriptor: number[]): boolean {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) return false;
    let sumSq = 0;
    let first = descriptor[0];
    let allSame = true;
    for (let i = 0; i < 128; i++) {
      const v = descriptor[i];
      if (typeof v !== 'number' || Number.isNaN(v)) return false;
      sumSq += v * v;
      if (v !== first) allSame = false;
    }
    const norm = Math.sqrt(sumSq);
    if (norm < 0.01) return false;
    if (allSame) return false;
    return true;
  }

  /** Save face descriptor for a member (admin enrollment). If already enrolled, replaces with the new face (re-enrollment). Rejects only when very confident this face is already another member's (strict threshold to avoid false positives). */
  async faceEnroll(tenantId: string, regNo: number, descriptor: number[]): Promise<boolean> {
    const settings = await this.tenantsService.getMySettings(tenantId);
    if (!settings.faceRecognitionEnabled) {
      throw new BadRequestException('Face recognition is disabled for this gym. Enable it in Check-in settings to enroll faces.');
    }
    const alreadyEnrolled = await this.membersService.hasFaceDescriptor(tenantId, regNo);
    if (alreadyEnrolled) {
      await this.membersService.clearFaceDescriptor(tenantId, regNo);
    }
    const others = await this.membersService.getMembersWithFaceDescriptors(tenantId);
    for (const m of others) {
      if (m.regNo === regNo) continue;
      if (!AttendanceService.isDescriptorValid(m.faceDescriptor)) continue;
      const dist = AttendanceService.descriptorDistance(descriptor, m.faceDescriptor);
      if (dist < AttendanceService.ENROLL_DUPLICATE_THRESHOLD) {
        throw new BadRequestException(
          `This face is already registered to another member: #${m.regNo} ${m.name}. Use a different photo or remove the other member's face first.`,
        );
      }
    }
    return this.membersService.updateFaceDescriptor(tenantId, regNo, descriptor);
  }

  /** Remove face enrollment for a member (opt out). They can check in by QR/name/Reg No again. */
  async removeFaceEnrollment(tenantId: string, regNo: number): Promise<boolean> {
    return this.membersService.clearFaceDescriptor(tenantId, regNo);
  }

  /**
   * Find best-matching member by face descriptor.
   * Uses strict threshold and margin to minimize false positives (unenrolled matching wrong person).
   * - THRESHOLD 0.38: same-person typically < 0.4; random/unknown faces usually > 0.5.
   * - MARGIN 0.12: reject when 2nd-best is too close (ambiguous match).
   */
  async findMemberByFace(tenantId: string, descriptor: number[]): Promise<{ regNo: number; name: string } | null> {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) return null;
    const settings = await this.tenantsService.getMySettings(tenantId);
    if (!settings.faceRecognitionEnabled) return null;
    const members = await this.membersService.getMembersWithFaceDescriptors(tenantId);
    if (members.length === 0) return null;
    const THRESHOLD = 0.38;
    const MARGIN = 0.12;
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

  /**
   * Check-in by face using Python service (image). Used when FACE_SERVICE_URL is set.
   */
  async checkInByFaceImage(token: string, imageBuffer: Buffer): Promise<{ success: boolean; name?: string; memberSummary?: Record<string, unknown>; checkInTime?: string } | null> {
    const tenantId = this.verifyQRToken(token);
    if (!tenantId) return null;
    const faceUrl = this.getFaceServiceUrl();
    if (!faceUrl) return null;
    const settings = await this.tenantsService.getMySettings(tenantId);
    if (!settings.faceRecognitionEnabled) return null;
    const members = await this.membersService.getMembersWithFaceDescriptorsDlib(tenantId);
    if (members.length === 0) return null;
    const enrolled = members.map((m) => ({ regNo: m.regNo, name: m.name, descriptor: m.faceDescriptorDlib }));
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' }), 'face.jpg');
    form.append('enrolled', JSON.stringify(enrolled));
    let res: Response;
    try {
      res = await fetch(`${faceUrl.replace(/\/$/, '')}/match-image`, { method: 'POST', body: form });
    } catch {
      return null;
    }
    const raw = await res.text();
    let data: { regNo?: number; name?: string; match?: boolean; error?: string };
    try {
      data = raw && raw.trim() ? (JSON.parse(raw) as { regNo?: number; name?: string; match?: boolean; error?: string }) : {};
    } catch {
      return null;
    }
    if (data.error || (!data.regNo && data.match === false)) return null;
    if (data.regNo == null) return null;
    const member = await this.checkIn(tenantId, data.regNo, 'Face');
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

  /**
   * Enroll face via Python service (image → dlib descriptor). Used when FACE_SERVICE_URL is set.
   */
  async faceEnrollImage(tenantId: string, regNo: number, imageBuffer: Buffer): Promise<boolean> {
    try {
      const faceUrl = this.getFaceServiceUrl();
      if (!faceUrl) {
        throw new BadRequestException(
          'Face enrollment by image is not configured. Set FACE_SERVICE_URL in the server .env (e.g. FACE_SERVICE_URL=http://localhost:8000) and restart the backend. Then start the Python face service: python -m uvicorn main:app --host 0.0.0.0 --port 8000',
        );
      }
      const settings = await this.tenantsService.getMySettings(tenantId);
      if (!settings.faceRecognitionEnabled) {
        throw new BadRequestException('Face recognition is disabled for this gym. Enable it in Attendance → Face recognition settings.');
      }
      const alreadyDlib = await this.membersService.hasFaceDescriptorDlib(tenantId, regNo);
      if (alreadyDlib) {
        await this.membersService.clearFaceDescriptor(tenantId, regNo);
      }
      const form = new FormData();
      form.append('image', new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' }), 'face.jpg');
      let res: Response;
      try {
        res = await fetch(`${faceUrl.replace(/\/$/, '')}/encode-image`, { method: 'POST', body: form });
      } catch {
        throw new BadRequestException('Cannot reach the face recognition service. Check that the Python service is running (e.g. http://localhost:8000).');
      }
      let raw: string;
      try {
        raw = await res.text();
      } catch {
        throw new BadRequestException('Face service did not return a valid response. Please try again.');
      }
      let data: { descriptor?: number[]; error?: string };
      try {
        data = raw && raw.trim() ? (JSON.parse(raw) as { descriptor?: number[]; error?: string }) : {};
      } catch {
        const trimmed = (raw && raw.trim()) || '';
        const isServerError = /internal server error|error 500|exception/i.test(trimmed);
        const friendlyMsg = isServerError || !res.ok
          ? 'Face recognition service is unavailable. Start the Python face service (e.g. run in python-face-service: python -m uvicorn main:app --host 0.0.0.0 --port 8000) and try again.'
          : trimmed.length < 300 && /^[\x20-\x7e\s]+$/.test(trimmed)
            ? trimmed
            : 'Face service returned an invalid response. Check that the Python face service is running and try again.';
        throw new BadRequestException(friendlyMsg);
      }
      if (data.error || !Array.isArray(data.descriptor) || data.descriptor.length !== 128) {
        const errMsg = typeof data.error === 'string' && data.error.trim() ? data.error.trim() : 'No face detected in the image. Please try again with a clearer photo.';
        throw new BadRequestException(errMsg);
      }
      const descriptor = data.descriptor;
      const others = await this.membersService.getMembersWithFaceDescriptorsDlib(tenantId);
      for (const m of others) {
        if (m.regNo === regNo) continue;
        if (!AttendanceService.isDescriptorValid(m.faceDescriptorDlib)) continue;
        const dist = AttendanceService.descriptorDistance(descriptor, m.faceDescriptorDlib);
        if (dist < AttendanceService.ENROLL_DUPLICATE_THRESHOLD) {
          throw new BadRequestException(
            `This face is already registered to another member: #${m.regNo} ${m.name}. Use a different photo or remove the other member's face first.`,
          );
        }
      }
      return this.membersService.updateFaceDescriptorDlib(tenantId, regNo, descriptor);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Unexpected token') || message.includes('is not valid JSON')) {
        throw new BadRequestException('Face recognition service returned an invalid response. Ensure the Python face service is running and try again.');
      }
      throw new BadRequestException(message && message.length < 200 ? message : 'Face enrollment failed. Please try again.');
    }
  }
}
