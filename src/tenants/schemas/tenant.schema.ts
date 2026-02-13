import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ThemeType = 'light' | 'dark';

export interface TenantBranding {
  logo?: string;           // URL
  backgroundImage?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
}

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ unique: true, sparse: true })
  slug: string;

  @Prop()
  subdomain?: string;

  @Prop({ unique: true, sparse: true })
  customDomain?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'dark' })
  defaultTheme: ThemeType;

  @Prop({ type: Object })
  branding?: TenantBranding;

  @Prop({ type: Object })
  settings?: Record<string, unknown>;

  /** Subscription tier: premium enables medical document upload for members. */
  @Prop({ default: 'free' })
  subscriptionTier?: 'free' | 'premium';

  /** Telegram: bot token (from @BotFather). Each tenant can have its own bot. */
  @Prop()
  telegramBotToken?: string;

  /** Telegram: chat ID for owner/group (absence summary). */
  @Prop()
  telegramChatId?: string;

  /** Telegram: group invite link for QR code so members can join the chat. */
  @Prop()
  telegramGroupInviteLink?: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
