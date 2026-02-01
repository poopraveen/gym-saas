import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'members' })
export class Member extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop()
  regNo: number;

  @Prop()
  name: string;

  @Prop()
  gender: string;

  @Prop()
  dateOfJoining: Date;

  @Prop()
  phoneNumber: string;

  @Prop()
  typeofPack: string;

  @Prop()
  dueDate: Date;

  @Prop()
  feesOptions: number;

  @Prop()
  feesAmount: number;

  @Prop({ type: Object })
  monthlyAttendance?: Record<string, number>;

  @Prop()
  lastCheckInTime?: string;

  @Prop()
  comments?: string;

  @Prop()
  lastUpdateDateTime?: string;

  @Prop({ type: Object })
  legacyFields?: Record<string, unknown>;
}

export const MemberSchema = SchemaFactory.createForClass(Member);
MemberSchema.index({ tenantId: 1, regNo: 1 }, { unique: true });
