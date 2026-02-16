import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Member } from './schemas/member.schema';

function toValidDate(val: unknown): Date | undefined {
  if (val == null || val === '') return undefined;
  const d = new Date(val as string | number | Date);
  return isNaN(d.getTime()) ? undefined : d;
}

function toValidNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).trim();
  const match = s.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function toValidOptionalNumber(val: unknown): number | undefined {
  if (val == null || val === '') return undefined;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).trim();
  const match = s.match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : undefined;
}

/** Maps legacy API field names to schema. */
function mapToMember(dto: Record<string, unknown>, tenantId: string): Partial<Member> {
  return {
    tenantId,
    regNo: toValidNumber(dto['Reg No:'] ?? dto.regNo),
    name: (dto['NAME'] ?? dto.name) as string,
    gender: (dto['Gender'] ?? dto.gender) as string,
    age: toValidOptionalNumber(dto.age ?? dto['Age']),
    heightCm: toValidOptionalNumber(dto.heightCm ?? dto['Height (cm)'] ?? dto.height),
    weightKg: toValidOptionalNumber(dto.weightKg ?? dto['Weight (kg)'] ?? dto.weight),
    goal: (dto.goal ?? dto['Goal']) != null ? String(dto.goal ?? dto['Goal']).trim() || undefined : undefined,
    dateOfJoining: toValidDate(dto['Date of Joining'] ?? dto.dateOfJoining),
    phoneNumber: String(dto['Phone Number'] ?? dto.phoneNumber ?? ''),
    email: (dto['Email'] ?? dto.email) != null ? String(dto['Email'] ?? dto.email).trim() || undefined : undefined,
    typeofPack: (dto['Typeof pack'] ?? dto.typeofPack) as string,
    dueDate: toValidDate(dto['DUE DATE'] ?? dto.dueDate),
    feesOptions: toValidNumber(dto['Fees Options'] ?? dto.feesOptions),
    feesAmount: toValidNumber(dto['Fees Amount'] ?? dto.feesAmount ?? dto['__EMPTY']),
    monthlyAttendance: (dto.monthlyAttendance ?? dto['monthlyAttendance']) as Record<string, number>,
    lastCheckInTime: (dto.lastCheckInTime ?? dto['lastCheckInTime']) as string,
    lastCheckInBy: (dto.lastCheckInBy ?? dto['lastCheckInBy']) as string,
    comments: (dto.comments ?? dto['comments']) as string,
    lastUpdateDateTime: (dto.lastUpdateDateTime ?? dto['lastUpdateDateTime']) as string,
    legacyFields: dto,
  };
}

/** Normalize phone to digits only for matching. */
function phoneToDigits(phone: string | undefined): string {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/** Maps member to legacy API response format for frontend compatibility. */
function mapToLegacy(m: Member): Record<string, unknown> {
  const legacy: Record<string, unknown> = {
    _id: m._id,
    'Reg No:': m.regNo,
    NAME: m.name,
    Gender: m.gender,
    'Date of Joining': m.dateOfJoining,
    'Phone Number': m.phoneNumber,
    Email: m.email,
    'Typeof pack': m.typeofPack,
    'DUE DATE': m.dueDate,
    'Fees Options': m.feesOptions,
    'Fees Amount': m.feesAmount,
    monthlyAttendance: m.monthlyAttendance,
    lastCheckInTime: m.lastCheckInTime,
    lastCheckInBy: m.lastCheckInBy,
    comments: m.comments,
    lastUpdateDateTime: m.lastUpdateDateTime,
    telegramChatId: m.telegramChatId,
    faceDescriptor: m.faceDescriptor,
    ...m.legacyFields,
  };
  return legacy;
}

@Injectable()
export class MembersService {
  constructor(@InjectModel(Member.name) private memberModel: Model<Member>) {}

  async upsert(tenantId: string, dto: Record<string, unknown>, deleteFlag: boolean) {
    const data = mapToMember(dto, tenantId);
    const regNo = data.regNo;

    const existing = await this.memberModel.findOne({ tenantId, regNo });
    if (deleteFlag && existing) {
      await this.memberModel.deleteOne({ _id: existing._id });
      return { deleted: true };
    }

    if (existing) {
      await this.memberModel.updateOne({ _id: existing._id }, { $set: data });
      const updated = await this.memberModel.findById(existing._id).lean();
      return mapToLegacy(updated as unknown as Member);
    }

    const created = await this.memberModel.create(data);
    return mapToLegacy(created.toObject());
  }

  async list(tenantId: string): Promise<Record<string, unknown>[]> {
    const members = await this.memberModel.find({ tenantId }).lean();
    return members.map((m) => {
      const row = mapToLegacy(m as unknown as Member);
      const regNo = Number(row['Reg No:']) || 0;
      const year = new Date().getFullYear();
      (row as Record<string, unknown>).memberId = `GYM-${year}-${String(regNo).padStart(5, '0')}`;
      return row;
    });
  }

  async getFinanceSummary(tenantId: string) {
    const members = await this.memberModel.find({ tenantId }).lean();
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthlyFees = 0;
    let overallFees = 0;
    let activeMembers = 0;
    let pendingFees = 0;
    for (const m of members) {
      const amt = Number((m as Record<string, unknown>).feesAmount) || 0;
      const dueDate = (m as Record<string, unknown>).dueDate;
      const joinDate = (m as Record<string, unknown>).dateOfJoining;
      overallFees += amt;
      if (joinDate && new Date(joinDate as string | number | Date) >= thisMonthStart) monthlyFees += amt;
      const due = dueDate ? new Date(dueDate as string | number | Date) : null;
      const daysToDue = due ? Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 999;
      if (daysToDue >= 0) activeMembers++;
      else if (daysToDue >= -90) pendingFees += Math.round(amt * 0.5);
    }
    return {
      monthlyFees,
      overallFees,
      totalMembers: members.length,
      activeMembers,
      pendingFees,
    };
  }

  async getMonthlyCollections(tenantId: string, months = 12) {
    const members = await this.memberModel.find({ tenantId }).select('dateOfJoining feesAmount').lean();
    const now = new Date();
    const byMonth: { month: string; monthKey: string; amount: number; count: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      let amount = 0;
      let count = 0;
      for (const m of members) {
        const j = (m as Record<string, unknown>).dateOfJoining as string | number | Date | undefined;
        if (!j) continue;
        const dt = new Date(j as string | number | Date);
        if (dt >= d && dt < next) {
          amount += Number((m as Record<string, unknown>).feesAmount) || 0;
          count++;
        }
      }
      byMonth.push({
        month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        amount,
        count,
      });
    }
    return byMonth;
  }

  async getMonthlyGrowth(tenantId: string, months = 6) {
    const members = await this.memberModel.find({ tenantId }).select('dateOfJoining').lean();
    const now = new Date();
    const result: { month: string; count: number; cumulative: number }[] = [];
    let cumulative = 0;
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = members.filter((m) => {
        const j = (m as Record<string, unknown>).dateOfJoining as string | number | Date | undefined;
        if (!j) return false;
        const dt = new Date(j as string | number | Date);
        return dt >= d && dt < next;
      }).length;
      cumulative += count;
      result.push({
        month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count,
        cumulative,
      });
    }
    return result;
  }

  async getMaxRegNo(tenantId: string): Promise<number> {
    const r = await this.memberModel.findOne({ tenantId }).sort({ regNo: -1 }).select('regNo').lean();
    return r?.regNo ?? 0;
  }

  /** Check if a member exists by phone (for enquiry conversion duplicate check). */
  async findByPhone(tenantId: string, phoneNumber: string): Promise<Record<string, unknown> | null> {
    const normalized = String(phoneNumber || '').trim();
    if (!normalized) return null;
    const m = await this.memberModel.findOne({ tenantId, phoneNumber: normalized }).lean();
    return m ? (m as unknown as Record<string, unknown>) : null;
  }

  /**
   * Lookup member by gym ID (e.g. GYM-2025-00001) or Reg No.
   * Returns legacy-format row with memberId. Only onboarded members can be found.
   */
  async findByGymIdOrRegNo(tenantId: string, query: string): Promise<Record<string, unknown> | null> {
    const q = String(query || '').trim();
    if (!q) return null;
    const year = new Date().getFullYear();
    let regNo: number | null = null;
    const match = q.match(/^GYM-(\d{4})-(\d+)$/i);
    if (match) {
      regNo = parseInt(match[2], 10);
    } else if (/^\d+$/.test(q)) {
      regNo = parseInt(q, 10);
    }
    if (regNo == null || isNaN(regNo)) return null;
    const m = await this.memberModel.findOne({ tenantId, regNo }).lean();
    if (!m) return null;
    const row = mapToLegacy(m as unknown as Member);
    (row as Record<string, unknown>).memberId = `GYM-${year}-${String(regNo).padStart(5, '0')}`;
    return row;
  }

  /**
   * Update member email (e.g. when creating a member login so it can be used later for lookup/prefill).
   */
  async updateEmail(tenantId: string, regNo: number, email: string): Promise<void> {
    const trimmed = String(email || '').trim();
    if (!trimmed) return;
    await this.memberModel.updateOne(
      { tenantId, regNo },
      { $set: { email: trimmed } },
    );
  }

  /**
   * Get RDI/nutrition profile for a member (age, gender, heightCm, weightKg, goal).
   */
  async getProfile(tenantId: string, regNo: number): Promise<{ age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string }> {
    const m = await this.memberModel.findOne({ tenantId, regNo }).select('age gender heightCm weightKg goal').lean();
    if (!m) return {};
    const row = m as unknown as Record<string, unknown>;
    return {
      age: row.age != null ? Number(row.age) : undefined,
      gender: row.gender != null ? String(row.gender) : undefined,
      heightCm: row.heightCm != null ? Number(row.heightCm) : undefined,
      weightKg: row.weightKg != null ? Number(row.weightKg) : undefined,
      goal: row.goal != null ? String(row.goal) : undefined,
    };
  }

  /** Common country codes to strip for matching (e.g. 65 Singapore, 91 India). */
  private static readonly COUNTRY_CODES = ['65', '91', '60', '1', '44', '81', '86', '82', '966', '971', '64', '61', '49', '33', '39', '34', '63', '62', '84', '66'];

  /**
   * Find a member by phone: digits-only match. Supports with/without country code; match by full digits or by last 8+ digits (suffix).
   * So 93436035 matches member +65 9343 6035; only phone number match is required for successful opt-in.
   */
  async findByPhoneDigits(tenantId: string, phoneDigits: string): Promise<Member | null> {
    const digits = phoneDigits.replace(/\D/g, '');
    if (!digits || digits.length < 8) return null;
    const members = await this.memberModel.find({ tenantId }).lean();
    for (const m of members) {
      const row = m as Record<string, unknown>;
      const p = (row.phoneNumber ?? row['Phone Number']) as string | undefined;
      const memberDigits = phoneToDigits(p);
      if (!memberDigits || memberDigits.length < 8) continue;
      if (memberDigits === digits) return m as unknown as Member;
      const digitsNoCountry = this.stripCountryCode(digits);
      const memberNoCountry = this.stripCountryCode(memberDigits);
      if (digitsNoCountry && (digitsNoCountry === memberDigits || digitsNoCountry === memberNoCountry)) return m as unknown as Member;
      if (memberNoCountry && (memberNoCountry === digits || memberNoCountry === digitsNoCountry)) return m as unknown as Member;
      // Suffix match: e.g. user 93436035, member 6593436035 → match; or user 6593436035, member 93436035 → match
      const longer = digits.length >= memberDigits.length ? digits : memberDigits;
      const shorter = digits.length < memberDigits.length ? digits : memberDigits;
      if (shorter.length >= 8 && longer.endsWith(shorter)) return m as unknown as Member;
    }
    return null;
  }

  private stripCountryCode(digits: string): string {
    if (!digits) return '';
    for (const cc of MembersService.COUNTRY_CODES) {
      if (digits.startsWith(cc) && digits.length > cc.length) return digits.slice(cc.length);
    }
    return digits;
  }

  /**
   * Find a member by Telegram chat ID (for attendance via Telegram). Returns legacy-shaped record or null.
   */
  async findByTelegramChatId(tenantId: string, telegramChatId: string): Promise<Record<string, unknown> | null> {
    const doc = await this.memberModel.findOne({ tenantId, telegramChatId }).lean();
    if (!doc) return null;
    return mapToLegacy(doc as unknown as Member);
  }

  /**
   * Set Telegram chat ID for a member (for absence alerts). Called when member messages the bot with their phone.
   */
  async updateTelegramChatId(tenantId: string, regNo: number, telegramChatId: string): Promise<void> {
    await this.memberModel.updateOne(
      { tenantId, regNo },
      { $set: { telegramChatId } },
    );
  }

  /**
   * Save face descriptor (128-d) for a member. Used for face recognition check-in.
   */
  async updateFaceDescriptor(tenantId: string, regNo: number, descriptor: number[]): Promise<boolean> {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) return false;
    const result = await this.memberModel.updateOne(
      { tenantId, regNo },
      { $set: { faceDescriptor: descriptor } },
    );
    return result.matchedCount === 1;
  }

  /**
   * Get members that have a face descriptor (for matching). Returns regNo, name, faceDescriptor.
   */
  async getMembersWithFaceDescriptors(tenantId: string): Promise<{ regNo: number; name: string; faceDescriptor: number[] }[]> {
    const docs = await this.memberModel
      .find({ tenantId, faceDescriptor: { $exists: true, $ne: null } })
      .select('regNo name faceDescriptor')
      .lean();
    return docs
      .filter((m) => {
        const fd = (m as Record<string, unknown>).faceDescriptor;
        return Array.isArray(fd) && fd.length === 128;
      })
      .map((m) => {
        const r = m as Record<string, unknown>;
        return {
          regNo: Number(r.regNo) || 0,
          name: String(r.name ?? ''),
          faceDescriptor: r.faceDescriptor as number[],
        };
      })
      .filter((x) => x.regNo && x.name);
  }

  /**
   * Update RDI/nutrition profile for a member. Only provided fields are updated.
   */
  async updateProfile(
    tenantId: string,
    regNo: number,
    profile: { age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string },
  ): Promise<void> {
    const set: Record<string, unknown> = {};
    if (profile.age !== undefined) set.age = profile.age;
    if (profile.gender !== undefined) set.gender = profile.gender;
    if (profile.heightCm !== undefined) set.heightCm = profile.heightCm;
    if (profile.weightKg !== undefined) set.weightKg = profile.weightKg;
    if (profile.goal !== undefined) set.goal = profile.goal;
    if (Object.keys(set).length === 0) return;
    await this.memberModel.updateOne({ tenantId, regNo }, { $set: set });
  }
}
