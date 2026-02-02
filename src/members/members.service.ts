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

/** Maps legacy API field names to schema. */
function mapToMember(dto: Record<string, unknown>, tenantId: string): Partial<Member> {
  return {
    tenantId,
    regNo: toValidNumber(dto['Reg No:'] ?? dto.regNo),
    name: (dto['NAME'] ?? dto.name) as string,
    gender: (dto['Gender'] ?? dto.gender) as string,
    dateOfJoining: toValidDate(dto['Date of Joining'] ?? dto.dateOfJoining),
    phoneNumber: String(dto['Phone Number'] ?? dto.phoneNumber ?? ''),
    typeofPack: (dto['Typeof pack'] ?? dto.typeofPack) as string,
    dueDate: toValidDate(dto['DUE DATE'] ?? dto.dueDate),
    feesOptions: toValidNumber(dto['Fees Options'] ?? dto.feesOptions),
    feesAmount: toValidNumber(dto['Fees Amount'] ?? dto.feesAmount ?? dto['__EMPTY']),
    monthlyAttendance: (dto.monthlyAttendance ?? dto['monthlyAttendance']) as Record<string, number>,
    lastCheckInTime: (dto.lastCheckInTime ?? dto['lastCheckInTime']) as string,
    comments: (dto.comments ?? dto['comments']) as string,
    lastUpdateDateTime: (dto.lastUpdateDateTime ?? dto['lastUpdateDateTime']) as string,
    legacyFields: dto,
  };
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
    'Typeof pack': m.typeofPack,
    'DUE DATE': m.dueDate,
    'Fees Options': m.feesOptions,
    'Fees Amount': m.feesAmount,
    monthlyAttendance: m.monthlyAttendance,
    lastCheckInTime: m.lastCheckInTime,
    comments: m.comments,
    lastUpdateDateTime: m.lastUpdateDateTime,
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
}
