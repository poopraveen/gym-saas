import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'medical_history_documents' })
export class MedicalHistoryDocument extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true })
  publicId: string;

  /** Cloudinary resource_type (e.g. image, raw) for correct delete. */
  @Prop()
  resourceType?: string;

  @Prop({ required: true })
  originalName: string;

  /** Optional display name for the medical record (e.g. "Blood test March 2024"). */
  @Prop()
  label?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  size?: number;

  @Prop({ required: true })
  url: string;

  @Prop({ default: Date.now })
  uploadedAt: Date;
}

export const MedicalHistoryDocumentSchema = SchemaFactory.createForClass(MedicalHistoryDocument);
MedicalHistoryDocumentSchema.index({ tenantId: 1, userId: 1 });
