import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Day of week: 0 = Sunday, 1 = Monday, ... 6 = Saturday */
export interface PlanDay {
  dayOfWeek: number;
  label: string;
}

@Schema({ timestamps: true, collection: 'workout_plans' })
export class WorkoutPlan extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ default: 'My Plan' })
  name: string;

  @Prop({ type: [{ dayOfWeek: Number, label: String }], default: [] })
  days: PlanDay[];

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const WorkoutPlanSchema = SchemaFactory.createForClass(WorkoutPlan);
WorkoutPlanSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
