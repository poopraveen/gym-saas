import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'follow_ups' })
export class FollowUp extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  memberId: string;

  @Prop()
  regNo: number;

  @Prop({ required: true })
  comment: string;

  @Prop()
  nextFollowUpDate?: Date;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const FollowUpSchema = SchemaFactory.createForClass(FollowUp);
FollowUpSchema.index({ tenantId: 1, memberId: 1 });
