import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MedicalHistoryController } from './medical-history.controller';
import { MedicalHistoryService } from './medical-history.service';
import { MedicalHistoryDocumentsService } from './medical-history-documents.service';
import { MedicalHistory, MedicalHistorySchema } from './schemas/medical-history.schema';
import {
  MedicalHistoryDocument,
  MedicalHistoryDocumentSchema,
} from './schemas/medical-history-document.schema';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MedicalHistory.name, schema: MedicalHistorySchema },
      { name: MedicalHistoryDocument.name, schema: MedicalHistoryDocumentSchema },
    ]),
    TenantsModule,
  ],
  controllers: [MedicalHistoryController],
  providers: [MedicalHistoryService, MedicalHistoryDocumentsService],
  exports: [MedicalHistoryService],
})
export class MedicalHistoryModule {}

