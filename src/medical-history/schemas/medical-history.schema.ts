import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'medical_histories' })
export class MedicalHistory extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  bloodGroup?: string;

  @Prop({ type: [String], default: [] })
  allergies?: string[];

  @Prop({ type: [String], default: [] })
  conditions?: string[];

  @Prop({ type: [String], default: [] })
  medications?: string[];

  @Prop({ type: [String], default: [] })
  injuries?: string[];

  @Prop()
  notes?: string;

  @Prop()
  emergencyContactName?: string;

  @Prop()
  emergencyContactPhone?: string;
}

export const MedicalHistorySchema = SchemaFactory.createForClass(MedicalHistory);
MedicalHistorySchema.index({ tenantId: 1, userId: 1 }, { unique: true });

