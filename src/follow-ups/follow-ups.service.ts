import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FollowUp } from './schemas/follow-up.schema';

@Injectable()
export class FollowUpsService {
  constructor(@InjectModel(FollowUp.name) private followUpModel: Model<FollowUp>) {}

  async create(
    tenantId: string,
    memberId: string,
    regNo: number,
    comment: string,
    nextFollowUpDate?: Date,
  ) {
    return this.followUpModel.create({
      tenantId,
      memberId,
      regNo,
      comment,
      nextFollowUpDate,
    });
  }

  async getByMember(tenantId: string, memberId: string) {
    return this.followUpModel
      .find({ tenantId, memberId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getLatestByMembers(tenantId: string, memberIds: string[]) {
    const docs = await this.followUpModel
      .aggregate([
        { $match: { tenantId, memberId: { $in: memberIds } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$memberId', doc: { $first: '$$ROOT' } } },
      ])
      .exec();
    const map: Record<string, { comment: string; nextFollowUpDate?: Date; createdAt: Date }> = {};
    docs.forEach((d: { _id: string; doc: FollowUp }) => {
      map[d._id] = {
        comment: d.doc.comment,
        nextFollowUpDate: d.doc.nextFollowUpDate,
        createdAt: d.doc.createdAt,
      };
    });
    return map;
  }
}
