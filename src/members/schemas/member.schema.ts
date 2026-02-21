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

  /** Optional RDI/nutrition profile (age in years, height in cm, weight in kg, goal). */
  @Prop()
  age?: number;

  @Prop()
  heightCm?: number;

  @Prop()
  weightKg?: number;

  @Prop()
  goal?: string;

  @Prop()
  dateOfJoining: Date;

  @Prop()
  phoneNumber: string;

  @Prop()
  email: string;

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

  /** Who recorded this check-in (trainer name or "QR" for member self check-in). */
  @Prop()
  lastCheckInBy?: string;

  @Prop()
  comments?: string;

  @Prop()
  lastUpdateDateTime?: string;

  /** Telegram chat ID for absence alerts (set when member messages the bot with phone). */
  @Prop()
  telegramChatId?: string;

  /** Face recognition: 128-d descriptor from face-api.js for check-in by face. */
  @Prop({ type: [Number] })
  faceDescriptor?: number[];

  /** Face recognition fallback: 128-d descriptor from Python/dlib (when FACE_SERVICE_URL is set). */
  @Prop({ type: [Number] })
  faceDescriptorDlib?: number[];

  @Prop({ type: Object })
  legacyFields?: Record<string, unknown>;
}

export const MemberSchema = SchemaFactory.createForClass(Member);
MemberSchema.index({ tenantId: 1, regNo: 1 }, { unique: true });
MemberSchema.index({ tenantId: 1, telegramChatId: 1 }, { sparse: true });
