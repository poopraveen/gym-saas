import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Single food item with estimated calories (from AI or manual) */
export interface CalorieItem {
  name: string;
  quantity?: string;
  estimatedCalories: number;
}

@Schema({ timestamps: true, collection: 'calorie_entries' })
export class CalorieEntry extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  /** Date for this entry (YYYY-MM-DD). One entry per user per date when source=user. */
  @Prop({ required: true, index: true })
  date: string;

  /** user = from chat/input; system = auto-filled default */
  @Prop({ type: String, enum: ['user', 'system'], required: true, default: 'user' })
  source: 'user' | 'system';

  @Prop({ required: true, default: 0 })
  totalCalories: number;

  /** Structured items from AI or empty for system default */
  @Prop({ type: Object, default: {} })
  detailsJson: { items?: CalorieItem[]; rawMessage?: string };

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const CalorieEntrySchema = SchemaFactory.createForClass(CalorieEntry);
// One user entry per date per tenant (user-submitted); system can fill gaps
CalorieEntrySchema.index({ tenantId: 1, userId: 1, date: 1 }, { unique: true });
