import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EnquiryMember, EnquirySource, EnquiryStatus } from './schemas/enquiry-member.schema';
import { EnquiryFollowUp, EnquiryFollowUpType } from './schemas/enquiry-followup.schema';
import { MembersService } from '../members/members.service';

export interface CreateEnquiryDto {
  name: string;
  phoneNumber: string;
  email?: string;
  enquiryDate?: string;
  source: EnquirySource;
  interestedPlan?: string;
  notes?: string;
  expectedJoinDate?: string;
  assignedStaff?: string;
  followUpRequired?: boolean;
}

export interface UpdateEnquiryDto extends Partial<CreateEnquiryDto> {
  status?: EnquiryStatus;
}

export interface CreateEnquiryFollowUpDto {
  followUpDate?: string;
  followUpType: EnquiryFollowUpType;
  notes?: string;
  nextFollowUpDate?: string;
}

export interface ListEnquiriesFilters {
  status?: EnquiryStatus;
  followUpToday?: boolean;
  overdue?: boolean;
  newLast24h?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class EnquiriesService {
  constructor(
    @InjectModel(EnquiryMember.name) private enquiryModel: Model<EnquiryMember>,
    @InjectModel(EnquiryFollowUp.name) private followUpModel: Model<EnquiryFollowUp>,
    private membersService: MembersService,
  ) {}

  private toDate(val: unknown): Date | undefined {
    if (val == null || val === '') return undefined;
    const d = new Date(val as string | number | Date);
    return isNaN(d.getTime()) ? undefined : d;
  }

  async create(tenantId: string, dto: CreateEnquiryDto) {
    const doc = await this.enquiryModel.create({
      tenantId,
      name: dto.name.trim(),
      phoneNumber: String(dto.phoneNumber).trim(),
      email: dto.email?.trim() || undefined,
      enquiryDate: this.toDate(dto.enquiryDate) || new Date(),
      source: dto.source,
      interestedPlan: dto.interestedPlan?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      expectedJoinDate: this.toDate(dto.expectedJoinDate),
      assignedStaff: dto.assignedStaff?.trim() || undefined,
      followUpRequired: dto.followUpRequired ?? true,
      status: 'New',
    });
    return doc.toObject();
  }

  async update(tenantId: string, id: string, dto: UpdateEnquiryDto) {
    const objId = new Types.ObjectId(id);
    const existing = await this.enquiryModel.findOne({ _id: objId, tenantId });
    if (!existing) return null;
    const update: Record<string, unknown> = {};
    if (dto.name != null) update.name = dto.name.trim();
    if (dto.phoneNumber != null) update.phoneNumber = String(dto.phoneNumber).trim();
    if (dto.email != null) update.email = dto.email.trim() || undefined;
    if (dto.enquiryDate != null) update.enquiryDate = this.toDate(dto.enquiryDate) ?? existing.enquiryDate;
    if (dto.source != null) update.source = dto.source;
    if (dto.interestedPlan != null) update.interestedPlan = dto.interestedPlan.trim() || undefined;
    if (dto.notes != null) update.notes = dto.notes.trim() || undefined;
    if (dto.expectedJoinDate != null) update.expectedJoinDate = this.toDate(dto.expectedJoinDate);
    if (dto.assignedStaff != null) update.assignedStaff = dto.assignedStaff.trim() || undefined;
    if (dto.followUpRequired != null) update.followUpRequired = dto.followUpRequired;
    if (dto.status != null) update.status = dto.status;
    await this.enquiryModel.updateOne({ _id: objId, tenantId }, { $set: update });
    const updated = await this.enquiryModel.findById(objId).lean();
    return updated;
  }

  async findById(tenantId: string, id: string) {
    const objId = new Types.ObjectId(id);
    const enquiry = await this.enquiryModel.findOne({ _id: objId, tenantId }).lean();
    return enquiry;
  }

  async list(tenantId: string, filters: ListEnquiriesFilters = {}) {
    const query: Record<string, unknown> = { tenantId };
    const { status, followUpToday, overdue, newLast24h, search, page = 1, limit = 20 } = filters;

    if (status) query.status = status;
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      query.$and = query.$and || [];
      (query.$and as object[]).push({
        $or: [
          { name: new RegExp(q, 'i') },
          { phoneNumber: new RegExp(q, 'i') },
          { email: new RegExp(q, 'i') },
          { notes: new RegExp(q, 'i') },
        ],
      });
    }
    if (followUpToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      query.$and = query.$and || [];
      (query.$and as object[]).push({ status: { $ne: 'Converted' } });
      (query.$and as object[]).push({ expectedJoinDate: { $gte: today, $lt: tomorrow } });
    }
    if (overdue) {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      twoDaysAgo.setHours(0, 0, 0, 0);
      query.$and = query.$and || [];
      (query.$and as object[]).push({ status: { $ne: 'Converted' } });
      (query.$and as object[]).push({
        $or: [
          { expectedJoinDate: { $exists: true, $ne: null, $lt: twoDaysAgo } },
          { followUpRequired: true, lastFollowUpDate: { $exists: true, $lt: twoDaysAgo } },
        ],
      });
    }
    if (newLast24h) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      query.enquiryDate = { $gte: yesterday };
    }

    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
    const total = await this.enquiryModel.countDocuments(query);
    const list = await this.enquiryModel
      .find(query)
      .sort({ enquiryDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, Math.max(1, limit)))
      .lean();
    return {
      items: list,
      total,
      page: Math.max(1, page),
      limit: Math.min(100, Math.max(1, limit)),
      totalPages: Math.ceil(total / Math.min(100, Math.max(1, limit))),
    };
  }

  async addFollowUp(tenantId: string, enquiryId: string, dto: CreateEnquiryFollowUpDto) {
    const objId = new Types.ObjectId(enquiryId);
    const enquiry = await this.enquiryModel.findOne({ _id: objId, tenantId });
    if (!enquiry) return null;
    const followUpDate = this.toDate(dto.followUpDate) || new Date();
    const doc = await this.followUpModel.create({
      tenantId,
      enquiryId: objId,
      followUpDate,
      followUpType: dto.followUpType,
      notes: dto.notes?.trim() || undefined,
      nextFollowUpDate: this.toDate(dto.nextFollowUpDate),
    });
    await this.enquiryModel.updateOne(
      { _id: objId, tenantId },
      { $set: { lastFollowUpDate: followUpDate, status: 'Follow-up' } },
    );
    return doc.toObject();
  }

  async getFollowUpsByEnquiry(tenantId: string, enquiryId: string) {
    const objId = new Types.ObjectId(enquiryId);
    const list = await this.followUpModel
      .find({ tenantId, enquiryId: objId })
      .sort({ followUpDate: -1 })
      .lean();
    return list;
  }

  async markLost(tenantId: string, id: string) {
    const objId = new Types.ObjectId(id);
    const result = await this.enquiryModel.updateOne(
      { _id: objId, tenantId },
      { $set: { status: 'Lost' } },
    );
    return result.matchedCount > 0;
  }

  async convertToMember(
    tenantId: string,
    enquiryId: string,
    memberData: Record<string, unknown>,
  ) {
    const objId = new Types.ObjectId(enquiryId);
    const enquiry = await this.enquiryModel.findOne({ _id: objId, tenantId }).lean();
    if (!enquiry) return null;
    const e = enquiry as unknown as EnquiryMember & { phoneNumber: string; name: string };
    if (e.status === 'Converted') throw new ConflictException('Enquiry already converted');

    const phone = String(memberData['Phone Number'] ?? memberData.phoneNumber ?? e.phoneNumber).trim();
    const existingByPhone = await this.membersService.findByPhone(tenantId, phone);
    if (existingByPhone) throw new ConflictException('A member with this phone number already exists');

    const nextRegNo = (await this.membersService.getMaxRegNo(tenantId)) + 1;
    const payload = {
      ...memberData,
      'Reg No:': nextRegNo,
      NAME: memberData.NAME ?? memberData.name ?? e.name,
      'Phone Number': memberData['Phone Number'] ?? phone,
      name: memberData.name ?? e.name,
      phoneNumber: phone,
      comments: memberData.comments ?? memberData.notes ?? e.notes,
      notes: memberData.notes ?? e.notes,
      lastUpdateDateTime: String(Date.now()),
      monthlyAttendance: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 },
    };
    const created = await this.membersService.upsert(tenantId, payload, false);

    const memberId = (created as Record<string, unknown>)._id;
    await this.enquiryModel.updateOne(
      { _id: objId, tenantId },
      { $set: { status: 'Converted', convertedMemberId: memberId } },
    );
    const updatedEnquiry = await this.enquiryModel.findById(objId).lean();
    return { member: created, enquiry: updatedEnquiry };
  }
}
