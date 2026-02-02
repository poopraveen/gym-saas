import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../common/constants/roles';

@Schema({ timestamps: true, collection: 'users' })
export class User extends Document {
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop()
  name: string;

  @Prop({ type: String, enum: Role, required: true })
  role: Role;

  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
// Unique per tenant (email can exist in multiple tenants)
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
