import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'workout_logs' })
export class WorkoutLog extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({ required: true })
  workoutLabel: string;

  @Prop()
  notes?: string;

  @Prop()
  durationMinutes?: number;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const WorkoutLogSchema = SchemaFactory.createForClass(WorkoutLog);
WorkoutLogSchema.index({ tenantId: 1, userId: 1, date: -1 });
