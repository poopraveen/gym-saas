import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  slug: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object })
  settings?: Record<string, unknown>;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
