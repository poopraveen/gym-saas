import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'trainer_assignments' })
export class TrainerAssignment extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  trainerUserId: string;

  @Prop({ required: true, index: true })
  memberUserId: string;
}

export const TrainerAssignmentSchema = SchemaFactory.createForClass(TrainerAssignment);
TrainerAssignmentSchema.index({ tenantId: 1, trainerUserId: 1, memberUserId: 1 }, { unique: true });
