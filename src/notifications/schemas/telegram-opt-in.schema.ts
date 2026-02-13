import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'telegram_opt_ins' })
export class TelegramOptIn extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true })
  telegramChatId: string;

  @Prop()
  phoneAttempted?: string;

  @Prop()
  messageText?: string;

  @Prop()
  memberId?: string;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed'] })
  status: 'pending' | 'confirmed';

  @Prop()
  createdAt?: Date;
}

export const TelegramOptInSchema = SchemaFactory.createForClass(TelegramOptIn);
TelegramOptInSchema.index({ tenantId: 1, createdAt: -1 });
