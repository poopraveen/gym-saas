import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EnquirySource = 'Walk-in' | 'Phone' | 'Website' | 'Referral' | 'Social Media';
export type EnquiryStatus = 'New' | 'Follow-up' | 'Converted' | 'Lost';

@Schema({ timestamps: true, collection: 'enquiry_members' })
export class EnquiryMember extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop()
  email?: string;

  @Prop({ default: () => new Date() })
  enquiryDate: Date;

  @Prop({ required: true, enum: ['Walk-in', 'Phone', 'Website', 'Referral', 'Social Media'] })
  source: EnquirySource;

  @Prop()
  interestedPlan?: string;

  @Prop()
  notes?: string;

  @Prop()
  expectedJoinDate?: Date;

  @Prop()
  assignedStaff?: string;

  @Prop({ default: true })
  followUpRequired: boolean;

  @Prop({ default: 'New', enum: ['New', 'Follow-up', 'Converted', 'Lost'] })
  status: EnquiryStatus;

  @Prop({ type: Types.ObjectId, ref: 'Member' })
  convertedMemberId?: Types.ObjectId;

  @Prop()
  lastFollowUpDate?: Date;
}

export const EnquiryMemberSchema = SchemaFactory.createForClass(EnquiryMember);
EnquiryMemberSchema.index({ tenantId: 1, phoneNumber: 1 });
EnquiryMemberSchema.index({ tenantId: 1, status: 1 });
EnquiryMemberSchema.index({ tenantId: 1, enquiryDate: -1 });
