import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class PushKeys {
  @Prop({ required: true })
  p256dh: string;

  @Prop({ required: true })
  auth: string;
}

export const PushKeysSchema = SchemaFactory.createForClass(PushKeys);

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionDoc extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  endpoint: string;

  @Prop({ type: PushKeysSchema, required: true })
  keys: PushKeys;

  @Prop()
  userAgent?: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscriptionDoc);
PushSubscriptionSchema.index({ tenantId: 1, userId: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
