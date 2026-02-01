import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'profile_users' })
export class ProfileUser extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop()
  phoneNumber: number;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  email: string;

  @Prop()
  country: string;

  @Prop()
  street: string;

  @Prop()
  city: string;

  @Prop()
  state: string;

  @Prop()
  zip: string;

  @Prop({ type: { publicUrl: String, imageName: String } })
  image?: { publicUrl?: string; imageName?: string };
}

export const ProfileUserSchema = SchemaFactory.createForClass(ProfileUser);
