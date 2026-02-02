import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EnquiryFollowUpType = 'Call' | 'WhatsApp' | 'Visit';

@Schema({ timestamps: true, collection: 'enquiry_followups' })
export class EnquiryFollowUp extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'EnquiryMember', index: true })
  enquiryId: Types.ObjectId;

  @Prop({ default: () => new Date() })
  followUpDate: Date;

  @Prop({ required: true, enum: ['Call', 'WhatsApp', 'Visit'] })
  followUpType: EnquiryFollowUpType;

  @Prop()
  notes?: string;

  @Prop()
  nextFollowUpDate?: Date;
}

export const EnquiryFollowUpSchema = SchemaFactory.createForClass(EnquiryFollowUp);
EnquiryFollowUpSchema.index({ tenantId: 1, enquiryId: 1 });
